# .NET Aspire Best Practices

## 项目结构

```
MyApp/
├── MyApp.AppHost/           # 应用编排
├── MyApp.ServiceDefaults/   # 共享配置
├── MyApp.Api/               # API 服务
├── MyApp.Web/               # Web 前端
└── MyApp.Worker/            # 后台服务
```

## 快速开始

```bash
dotnet new aspire-starter -n MyApp
```

## AppHost 编排

```csharp
var builder = DistributedApplication.CreateBuilder(args);

// 基础设施
var cache = builder.AddRedis("cache");
var postgres = builder.AddPostgres("postgres").WithDataVolume().WithPgAdmin();
var db = postgres.AddDatabase("appdb");
var rabbitmq = builder.AddRabbitMQ("messaging").WithManagementPlugin();

// API 服务
var api = builder.AddProject<Projects.MyApp_Api>("api")
    .WithReference(db)
    .WithReference(cache);

// Web 前端
builder.AddProject<Projects.MyApp_Web>("web")
    .WithExternalHttpEndpoints()
    .WithReference(api);

builder.Build().Run();
```

## 资源类型

```csharp
// 容器
builder.AddRedis("cache");
builder.AddPostgres("postgres").AddDatabase("db");
builder.AddRabbitMQ("messaging");
builder.AddKafka("kafka").WithKafkaUI();
builder.AddMongoDB("mongo").WithMongoExpress();

// Azure
builder.AddAzureStorage("storage").AddBlobs("blobs").AddQueues("queues");
builder.AddAzureCosmosDB("cosmos").AddDatabase("db");
builder.AddAzureServiceBus("servicebus").AddQueue("orders");

// Azure OpenAI (Aspire 9.2+ 新 API)
var openai = builder.AddAzureOpenAI("openai");
var chatModel = openai.AddDeployment("chat", "gpt-4o-mini", "2024-07-18");
var embedModel = openai.AddDeployment("embedding", "text-embedding-3-small", "1");
// 使用 WithReference 引用部署
builder.AddProject<Projects.Api>("api").WithReference(chatModel);

// 自定义容器
builder.AddContainer("custom", "myimage").WithEndpoint(port: 8080, name: "http");
```

## ServiceDefaults

```csharp
public static IHostApplicationBuilder AddServiceDefaults(this IHostApplicationBuilder builder)
{
    // OpenTelemetry
    builder.Services.AddOpenTelemetry()
        .WithMetrics(m => m.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation())
        .WithTracing(t => t.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation());

    // 健康检查
    builder.Services.AddHealthChecks().AddCheck("self", () => HealthCheckResult.Healthy());

    // 服务发现 + 弹性
    builder.Services.AddServiceDiscovery();
    builder.Services.ConfigureHttpClientDefaults(http => {
        http.AddStandardResilienceHandler();
        http.AddServiceDiscovery();
    });

    return builder;
}
```

## 服务发现

```csharp
builder.AddServiceDefaults();

// 使用服务名称而非 URL
builder.Services.AddHttpClient<IOrderService, OrderService>(c =>
    c.BaseAddress = new Uri("https+http://orders-api"));

// 自动注入连接字符串
builder.AddNpgsqlDbContext<AppDbContext>("appdb");
builder.AddRedisClient("cache");
```

## Dashboard

- **Resources**: 服务状态
- **Console Logs**: 实时日志
- **Structured Logs**: 结构化日志搜索
- **Traces**: 分布式追踪
- **Metrics**: 性能指标

访问: https://localhost:17000

## 配置参数

```csharp
var apiKey = builder.AddParameter("api-key", secret: true);
builder.AddProject<Projects.MyApp_Api>("api").WithEnvironment("API_KEY", apiKey);
```

```json
// appsettings.json
{ "Parameters": { "api-key": "your-key" } }
```

## 部署

### Azure Container Apps

```bash
azd init
azd up
```

```csharp
builder.AddProject<Projects.MyApp_Api>("api")
    .WithExternalHttpEndpoints()
    .PublishAsAzureContainerApp((infra, app) => {
        app.Template.Scale.MinReplicas = 1;
        app.Template.Scale.MaxReplicas = 10;
    });
```

### Kubernetes

```bash
dotnet run --project MyApp.AppHost -- --publisher helm --output-path ./charts
```

## 测试

```csharp
public class IntegrationTests : IAsyncLifetime
{
    private DistributedApplication _app = null!;

    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder.CreateAsync<Projects.MyApp_AppHost>();
        _app = await builder.BuildAsync();
        await _app.StartAsync();
    }

    [Fact]
    public async Task ApiReturnsOk()
    {
        var client = _app.CreateHttpClient("api");
        var response = await client.GetAsync("/health");
        response.EnsureSuccessStatusCode();
    }

    public async Task DisposeAsync() => await _app.DisposeAsync();
}
```
