# ASP.NET Core Best Practices

## 项目设置

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

var app = builder.Build();
app.UseExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
```

## Minimal API

```csharp
var users = app.MapGroup("/api/users").WithTags("Users");

users.MapGet("/{id:int}", async (int id, IUserService svc, CancellationToken ct) =>
{
    var user = await svc.GetByIdAsync(id, ct);
    return user is not null ? TypedResults.Ok(user) : TypedResults.NotFound();
}).Produces<UserDto>().ProducesProblem(404);

users.MapPost("/", CreateUser).WithValidation<CreateUserRequest>().RequireAuthorization();
```

## ASP.NET Core 10 内置验证

```csharp
builder.Services.AddValidation();

public class CreateUserRequest
{
    [Required, StringLength(100)] public string Name { get; set; } = "";
    [Required, EmailAddress] public string Email { get; set; } = "";
}

// 自动返回 400 验证错误
app.MapPost("/users", (CreateUserRequest request) => TypedResults.Created());
```

## 异常处理

```csharp
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

public class GlobalExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var problem = ex switch
        {
            NotFoundException => new ProblemDetails { Status = 404, Title = "Not Found" },
            _ => new ProblemDetails { Status = 500, Title = "Server Error" }
        };
        ctx.Response.StatusCode = problem.Status ?? 500;
        await ctx.Response.WriteAsJsonAsync(problem, ct);
        return true;
    }
}
```

## 身份认证

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true, ValidateAudience = true,
            ValidIssuer = config["Jwt:Issuer"], ValidAudience = config["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config["Jwt:Key"]!))
        };
    });

builder.Services.AddAuthorization(o => o.AddPolicy("AdminOnly", p => p.RequireRole("Admin")));
```

## 缓存

```csharp
// 输出缓存
builder.Services.AddOutputCache();
app.MapGet("/products", GetProducts).CacheOutput(p => p.Expire(TimeSpan.FromMinutes(10)));

// HybridCache
builder.Services.AddHybridCache();
return await cache.GetOrCreateAsync($"product:{id}", async ct => await LoadFromDb(id, ct));
```

## 速率限制

```csharp
builder.Services.AddRateLimiter(o => {
    o.AddFixedWindowLimiter("fixed", c => { c.Window = TimeSpan.FromMinutes(1); c.PermitLimit = 100; });
});
app.UseRateLimiter();
app.MapGet("/api/data", GetData).RequireRateLimiting("fixed");
```

## Server-Sent Events (SSE)

```csharp
app.MapGet("/stream", () => TypedResults.ServerSentEvents(GenerateMessages));

async IAsyncEnumerable<string> GenerateMessages([EnumeratorCancellation] CancellationToken ct)
{
    for (int i = 0; i < 10; i++)
    {
        await Task.Delay(1000, ct);
        yield return $"Message {i}";
    }
}
```

## 后台服务

```csharp
public class DataSyncService(IServiceScopeFactory scopeFactory) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        while (await timer.WaitForNextTickAsync(ct))
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<ISyncService>().SyncAsync(ct);
        }
    }
}
```

## HttpClient 工厂

```csharp
builder.Services.AddHttpClient<IGitHubClient, GitHubClient>(c => {
    c.BaseAddress = new Uri("https://api.github.com");
}).AddStandardResilienceHandler();
```

## 健康检查

```csharp
builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>().AddRedis(connStr);
app.MapHealthChecks("/health");
```

## 中间件顺序

```csharp
app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseOutputCache();
```
