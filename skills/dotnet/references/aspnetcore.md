# ASP.NET Core Best Practices

## 项目设置

```csharp
// Program.cs - 最小 API 风格
var builder = WebApplication.CreateBuilder(args);

// 服务注册
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddProblemDetails();

var app = builder.Build();

// 中间件管道
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.Run();
```

## 控制器设计

```csharp
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class UsersController : ControllerBase
{
    private readonly IUserService _userService;

    public UsersController(IUserService userService)
    {
        _userService = userService;
    }

    /// <summary>
    /// 获取用户详情
    /// </summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType<UserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetUser(int id, CancellationToken cancellationToken)
    {
        var user = await _userService.GetByIdAsync(id, cancellationToken);

        return user is null
            ? NotFound()
            : Ok(user);
    }

    /// <summary>
    /// 创建用户
    /// </summary>
    [HttpPost]
    [ProducesResponseType<UserDto>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateUser(
        [FromBody] CreateUserRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _userService.CreateAsync(request, cancellationToken);

        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, user);
    }
}
```

## 最小 API

```csharp
// 路由组织
var api = app.MapGroup("/api");
var users = api.MapGroup("/users").WithTags("Users");

users.MapGet("/", GetAllUsers)
    .WithName("GetUsers")
    .WithOpenApi();

users.MapGet("/{id:int}", GetUser)
    .WithName("GetUser")
    .Produces<UserDto>()
    .ProducesProblem(StatusCodes.Status404NotFound);

users.MapPost("/", CreateUser)
    .WithValidation<CreateUserRequest>()
    .RequireAuthorization();

// 端点处理方法
static async Task<Results<Ok<UserDto>, NotFound>> GetUser(
    int id,
    IUserService userService,
    CancellationToken cancellationToken)
{
    var user = await userService.GetByIdAsync(id, cancellationToken);

    return user is not null
        ? TypedResults.Ok(user)
        : TypedResults.NotFound();
}
```

## 验证

```csharp
// 使用 FluentValidation
public class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(256);

        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(8)
            .Matches("[A-Z]").WithMessage("密码必须包含大写字母")
            .Matches("[0-9]").WithMessage("密码必须包含数字");

        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(100);
    }
}

// 注册验证器
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// 验证过滤器
public class ValidationFilter<T> : IEndpointFilter where T : class
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        var validator = context.HttpContext.RequestServices
            .GetService<IValidator<T>>();

        if (validator is null)
            return await next(context);

        var arg = context.Arguments.OfType<T>().FirstOrDefault();
        if (arg is null)
            return await next(context);

        var result = await validator.ValidateAsync(arg);
        if (!result.IsValid)
            return TypedResults.ValidationProblem(result.ToDictionary());

        return await next(context);
    }
}
```

## 异常处理

```csharp
// 全局异常处理
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "Unhandled exception occurred");

        var problemDetails = exception switch
        {
            DomainException e => new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Business Rule Violation",
                Detail = e.Message,
                Extensions = { ["code"] = e.Code }
            },
            NotFoundException => new ProblemDetails
            {
                Status = StatusCodes.Status404NotFound,
                Title = "Resource Not Found",
                Detail = exception.Message
            },
            _ => new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "Internal Server Error",
                Detail = "An unexpected error occurred"
            }
        };

        httpContext.Response.StatusCode = problemDetails.Status ?? 500;
        await httpContext.Response.WriteAsJsonAsync(problemDetails, cancellationToken);

        return true;
    }
}
```

## 身份认证与授权

```csharp
// JWT 认证配置
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };
    });

// 基于策略的授权
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("Admin"));

    options.AddPolicy("CanEditUser", policy =>
        policy.Requirements.Add(new UserEditRequirement()));
});

// 自定义授权处理器
public class UserEditRequirementHandler : AuthorizationHandler<UserEditRequirement, User>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        UserEditRequirement requirement,
        User resource)
    {
        if (context.User.IsInRole("Admin") ||
            context.User.FindFirstValue(ClaimTypes.NameIdentifier) == resource.Id.ToString())
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
```

## 缓存

```csharp
// 输出缓存
builder.Services.AddOutputCache(options =>
{
    options.AddBasePolicy(builder => builder.Expire(TimeSpan.FromMinutes(5)));
    options.AddPolicy("NoCache", builder => builder.NoCache());
    options.AddPolicy("UserSpecific", builder =>
        builder.SetVaryByHeader("Authorization").Expire(TimeSpan.FromMinutes(1)));
});

app.UseOutputCache();

// 应用缓存策略
app.MapGet("/products", GetProducts)
    .CacheOutput(policy => policy.Expire(TimeSpan.FromMinutes(10)));

// 分布式缓存
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration.GetConnectionString("Redis");
    options.InstanceName = "MyApp:";
});

// 使用 HybridCache
builder.Services.AddHybridCache();

public class ProductService(HybridCache cache)
{
    public async Task<Product?> GetProductAsync(int id)
    {
        return await cache.GetOrCreateAsync(
            $"product:{id}",
            async ct => await LoadProductFromDbAsync(id, ct),
            new HybridCacheEntryOptions
            {
                Expiration = TimeSpan.FromMinutes(10),
                LocalCacheExpiration = TimeSpan.FromMinutes(1)
            });
    }
}
```

## 健康检查

```csharp
builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>()
    .AddRedis(builder.Configuration.GetConnectionString("Redis")!)
    .AddCheck<CustomHealthCheck>("custom");

app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false
});
```

## API 版本控制

```csharp
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
    options.ApiVersionReader = ApiVersionReader.Combine(
        new UrlSegmentApiVersionReader(),
        new HeaderApiVersionReader("X-Api-Version"));
})
.AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});

// v1
var v1 = app.NewApiVersionSet()
    .HasApiVersion(new ApiVersion(1, 0))
    .Build();

app.MapGet("/api/v{version:apiVersion}/users", GetUsersV1)
    .WithApiVersionSet(v1);

// v2
var v2 = app.NewApiVersionSet()
    .HasApiVersion(new ApiVersion(2, 0))
    .Build();

app.MapGet("/api/v{version:apiVersion}/users", GetUsersV2)
    .WithApiVersionSet(v2);
```

## 速率限制

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddFixedWindowLimiter("fixed", config =>
    {
        config.Window = TimeSpan.FromMinutes(1);
        config.PermitLimit = 100;
        config.QueueLimit = 10;
        config.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });

    options.AddSlidingWindowLimiter("sliding", config =>
    {
        config.Window = TimeSpan.FromMinutes(1);
        config.SegmentsPerWindow = 6;
        config.PermitLimit = 100;
    });

    options.AddTokenBucketLimiter("token", config =>
    {
        config.TokenLimit = 100;
        config.ReplenishmentPeriod = TimeSpan.FromSeconds(10);
        config.TokensPerPeriod = 10;
    });
});

app.UseRateLimiter();

app.MapGet("/api/data", GetData)
    .RequireRateLimiting("fixed");
```

## 后台服务

```csharp
// 后台任务服务
public class DataSyncService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DataSyncService> _logger;
    private readonly PeriodicTimer _timer;

    public DataSyncService(
        IServiceScopeFactory scopeFactory,
        ILogger<DataSyncService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (await _timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var syncService = scope.ServiceProvider.GetRequiredService<ISyncService>();
                await syncService.SyncDataAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Data sync failed");
            }
        }
    }
}

builder.Services.AddHostedService<DataSyncService>();
```

## HttpClient 工厂

```csharp
// 类型化客户端
builder.Services.AddHttpClient<IGitHubClient, GitHubClient>(client =>
{
    client.BaseAddress = new Uri("https://api.github.com");
    client.DefaultRequestHeaders.Add("Accept", "application/vnd.github.v3+json");
    client.DefaultRequestHeaders.Add("User-Agent", "MyApp");
})
.AddStandardResilienceHandler();  // 内置弹性处理

// 使用 Polly 自定义弹性策略
builder.Services.AddHttpClient<IExternalApiClient, ExternalApiClient>()
    .AddPolicyHandler(GetRetryPolicy())
    .AddPolicyHandler(GetCircuitBreakerPolicy());

static IAsyncPolicy<HttpResponseMessage> GetRetryPolicy()
{
    return HttpPolicyExtensions
        .HandleTransientHttpError()
        .WaitAndRetryAsync(3, retryAttempt =>
            TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)));
}
```

## 常用中间件顺序

```csharp
// 推荐的中间件顺序
app.UseExceptionHandler();
app.UseHsts();
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseOutputCache();
app.UseResponseCompression();
// 端点
app.MapControllers();
app.MapHealthChecks("/health");
```

## ASP.NET Core 10 新特性

### Minimal API 内置验证

```csharp
// 启用内置验证支持
builder.Services.AddValidation();

// 自动验证 query、header 和 request body 参数
app.MapPost("/users", (CreateUserRequest request) =>
{
    // 验证失败时自动返回 400 Bad Request
    return TypedResults.Created($"/users/{request.Id}", request);
});

// 验证模型
public class CreateUserRequest
{
    [Required]
    [StringLength(100)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Range(0, 150)]
    public int Age { get; set; }
}

// 支持嵌套对象和集合验证
public class OrderRequest
{
    [Required]
    public CustomerInfo Customer { get; set; } = null!;

    [MinLength(1)]
    public List<OrderItem> Items { get; set; } = [];
}

// 自定义错误响应
builder.Services.AddValidation(options =>
{
    options.UseProblemDetailsService = true;
});
```

### OpenAPI 3.1 支持

```csharp
// 默认生成 OpenAPI 3.1 文档
builder.Services.AddOpenApi();

// XML 注释自动填充到 OpenAPI 文档
/// <summary>
/// 获取用户信息
/// </summary>
/// <param name="id">用户 ID</param>
/// <returns>用户详情</returns>
/// <response code="200">成功返回用户</response>
/// <response code="404">用户不存在</response>
app.MapGet("/users/{id}", GetUser);

// 支持 YAML 格式输出
app.MapOpenApi("/openapi.yaml", options =>
{
    options.Format = OpenApiFormat.Yaml;
});

// 响应描述增强
app.MapGet("/orders/{id}", GetOrder)
    .Produces<OrderDto>(StatusCodes.Status200OK, description: "订单详情")
    .ProducesProblem(StatusCodes.Status404NotFound, description: "订单不存在");
```

### Server-Sent Events (SSE)

```csharp
// 使用 TypedResults.ServerSentEvents 流式传输数据
app.MapGet("/stream", () =>
{
    async IAsyncEnumerable<string> GenerateMessages(
        [EnumeratorCancellation] CancellationToken ct)
    {
        for (int i = 0; i < 10; i++)
        {
            await Task.Delay(1000, ct);
            yield return $"Message {i} at {DateTime.Now:HH:mm:ss}";
        }
    }

    return TypedResults.ServerSentEvents(GenerateMessages);
});

// 结合 AI 流式响应
app.MapPost("/chat", async (ChatRequest request, IChatClient chatClient) =>
{
    async IAsyncEnumerable<string> StreamResponse(
        [EnumeratorCancellation] CancellationToken ct)
    {
        await foreach (var chunk in chatClient.CompleteStreamingAsync(
            request.Message, cancellationToken: ct))
        {
            yield return chunk.Text ?? "";
        }
    }

    return TypedResults.ServerSentEvents(StreamResponse);
});
```

### Web Authentication (Passkey) 支持

```csharp
// ASP.NET Core Identity 支持 Passkey
builder.Services.AddIdentity<ApplicationUser, IdentityRole>()
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddDefaultTokenProviders()
    .AddWebAuthn(); // 添加 WebAuthn/Passkey 支持

// 配置 Passkey 选项
builder.Services.Configure<WebAuthnOptions>(options =>
{
    options.RelyingPartyId = "myapp.com";
    options.RelyingPartyName = "My Application";
    options.RequireResidentKey = true;
    options.UserVerification = UserVerificationRequirement.Preferred;
});

// Blazor Web App 模板已内置 Passkey 管理和登录支持
```

### 自动内存池驱逐

```csharp
// 长期运行应用中自动释放空闲内存
builder.Services.Configure<KestrelServerOptions>(options =>
{
    // 内存池自动驱逐已启用，减少内存占用
    options.Limits.MaxResponseBufferSize = 64 * 1024;
});
```
