# .NET Aspire Best Practices

## 概述

.NET Aspire 是一个用于构建可观测、生产就绪的分布式应用的云原生框架。它提供了内置的遥测、服务发现和云集成。

## 项目结构

```
MyApp/
├── MyApp.AppHost/           # 应用编排项目
│   └── Program.cs
├── MyApp.ServiceDefaults/   # 共享服务配置
│   └── Extensions.cs
├── MyApp.Api/               # API 服务
├── MyApp.Web/               # Web 前端
├── MyApp.Worker/            # 后台服务
└── MyApp.Tests/             # 集成测试
```

## 快速开始

```bash
# 创建 Aspire 项目
dotnet new aspire-starter -n MyApp

# 或添加到现有解决方案
dotnet new aspire-apphost -n MyApp.AppHost
dotnet new aspire-servicedefaults -n MyApp.ServiceDefaults
```

## AppHost 编排

### 基础配置

```csharp
// MyApp.AppHost/Program.cs
var builder = DistributedApplication.CreateBuilder(args);

// 添加 Redis 缓存
var cache = builder.AddRedis("cache");

// 添加 PostgreSQL 数据库
var postgres = builder.AddPostgres("postgres")
    .WithDataVolume()
    .WithPgAdmin();
var db = postgres.AddDatabase("appdb");

// 添加 API 服务
var api = builder.AddProject<Projects.MyApp_Api>("api")
    .WithReference(db)
    .WithReference(cache);

// 添加 Web 前端
builder.AddProject<Projects.MyApp_Web>("web")
    .WithExternalHttpEndpoints()
    .WithReference(api);

builder.Build().Run();
```

### 资源类型

```csharp
// 容器资源
var rabbitmq = builder.AddRabbitMQ("messaging")
    .WithManagementPlugin();

var kafka = builder.AddKafka("kafka")
    .WithKafkaUI();

var mongodb = builder.AddMongoDB("mongo")
    .WithMongoExpress();

// Azure 资源
var storage = builder.AddAzureStorage("storage");
var blobs = storage.AddBlobs("blobs");
var queues = storage.AddQueues("queues");

var cosmosDb = builder.AddAzureCosmosDB("cosmos")
    .AddDatabase("appdb");

var serviceBus = builder.AddAzureServiceBus("servicebus")
    .AddQueue("orders")
    .AddTopic("events");

// AWS 资源
var sqs = builder.AddAWS().AddSQSQueue("orders-queue");
var dynamodb = builder.AddAWS().AddDynamoDBTable("users");
```

### 自定义资源

```csharp
// 添加可执行程序
builder.AddExecutable("legacy-service", "dotnet", "path/to/app")
    .WithArgs("--port", "5000");

// 添加容器
builder.AddContainer("custom-service", "myregistry/myimage")
    .WithEndpoint(port: 8080, targetPort: 80, name: "http")
    .WithEnvironment("API_KEY", apiKey)
    .WithVolume("data-volume", "/app/data");

// 添加 C# 应用 (Aspire 13+)
builder.AddCSharpApp("analyzer", "../MyAnalyzer")
    .WithArgs("--verbose");
```

## ServiceDefaults 配置

```csharp
// MyApp.ServiceDefaults/Extensions.cs
public static class Extensions
{
    public static IHostApplicationBuilder AddServiceDefaults(
        this IHostApplicationBuilder builder)
    {
        // OpenTelemetry
        builder.ConfigureOpenTelemetry();

        // 健康检查
        builder.AddDefaultHealthChecks();

        // 服务发现
        builder.Services.AddServiceDiscovery();

        // HTTP 客户端弹性
        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            http.AddStandardResilienceHandler();
            http.AddServiceDiscovery();
        });

        return builder;
    }

    public static IHostApplicationBuilder ConfigureOpenTelemetry(
        this IHostApplicationBuilder builder)
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation();
            })
            .WithTracing(tracing =>
            {
                tracing.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddEntityFrameworkCoreInstrumentation();
            });

        builder.AddOpenTelemetryExporters();

        return builder;
    }

    public static IHostApplicationBuilder AddDefaultHealthChecks(
        this IHostApplicationBuilder builder)
    {
        builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }
}
```

## 服务发现

```csharp
// API 项目中使用服务发现
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// 配置 HTTP 客户端使用服务发现
builder.Services.AddHttpClient<IOrderService, OrderService>(client =>
{
    // 使用服务名称而非硬编码 URL
    client.BaseAddress = new Uri("https+http://orders-api");
});

// 或使用 Refit
builder.Services.AddRefitClient<IOrderApi>()
    .ConfigureHttpClient(c => c.BaseAddress = new Uri("https+http://orders-api"));
```

```csharp
// 连接字符串自动注入
builder.AddNpgsqlDbContext<AppDbContext>("appdb");
builder.AddRedisClient("cache");
builder.AddRabbitMQClient("messaging");
```

## Dashboard

```csharp
// 默认启用 Dashboard
// 访问 https://localhost:17000

// 自定义配置
builder.Services.AddOptions<DashboardOptions>()
    .Configure(options =>
    {
        options.OpenIdConnect.Enabled = true;
        options.OpenIdConnect.Authority = "https://identity.example.com";
    });
```

### Dashboard 功能

- **Resources**: 查看所有服务和依赖的状态
- **Console Logs**: 实时查看服务日志
- **Structured Logs**: 搜索和过滤结构化日志
- **Traces**: 分布式追踪可视化
- **Metrics**: 实时性能指标

## 配置管理

```csharp
// 使用参数
var apiKey = builder.AddParameter("api-key", secret: true);

var api = builder.AddProject<Projects.MyApp_Api>("api")
    .WithEnvironment("API_KEY", apiKey);

// 使用连接字符串
var connectionString = builder.AddConnectionString("database");

// 编码参数 (Aspire 13+)
var encodedConfig = builder.AddParameter("config", secret: true)
    .WithEncoding(ParameterEncoding.Base64);
```

```json
// appsettings.json
{
  "Parameters": {
    "api-key": "your-api-key-here"
  }
}
```

## 部署

### 生成清单

```bash
# 生成部署清单
dotnet run --project MyApp.AppHost -- --publisher manifest --output-path ./manifest.json
```

### Azure Container Apps

```bash
# 使用 azd 部署
azd init
azd up
```

```csharp
// 配置 Azure 部署
var api = builder.AddProject<Projects.MyApp_Api>("api")
    .WithExternalHttpEndpoints()
    .PublishAsAzureContainerApp((infrastructure, app) =>
    {
        app.Configuration.ActiveRevisionsMode = ActiveRevisionsMode.Multiple;
        app.Configuration.Ingress.TargetPort = 8080;
        app.Template.Scale.MinReplicas = 1;
        app.Template.Scale.MaxReplicas = 10;
    });
```

### Kubernetes

```bash
# 生成 Helm charts
dotnet run --project MyApp.AppHost -- --publisher helm --output-path ./charts
```

## 测试

```csharp
// 使用 DistributedApplicationTestingBuilder
public class IntegrationTests : IAsyncLifetime
{
    private DistributedApplication _app = null!;
    private HttpClient _httpClient = null!;

    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.MyApp_AppHost>();

        // 替换外部依赖为测试容器
        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            http.AddStandardResilienceHandler(options =>
            {
                options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(30);
            });
        });

        _app = await builder.BuildAsync();
        await _app.StartAsync();

        _httpClient = _app.CreateHttpClient("api");
    }

    public async Task DisposeAsync()
    {
        await _app.DisposeAsync();
    }

    [Fact]
    public async Task GetUsers_ReturnsOk()
    {
        var response = await _httpClient.GetAsync("/api/users");

        response.EnsureSuccessStatusCode();
    }
}
```

## 多语言支持 (Aspire 13+)

```csharp
// Python 服务
var pythonApi = builder.AddPythonApp("python-ml", "../ml-service", "app.py")
    .WithHttpEndpoint(targetPort: 8000)
    .WithEnvironment("MODEL_PATH", "/models");

// Node.js 服务
var nodeApi = builder.AddNodeApp("node-api", "../frontend", "server.js")
    .WithHttpEndpoint(targetPort: 3000)
    .WithNpmPackageInstallation();

// 任意可执行文件
var goService = builder.AddExecutable("go-service", "go", "../go-service")
    .WithArgs("run", ".")
    .WithHttpEndpoint(targetPort: 8080);

// .NET 项目引用其他语言服务
var api = builder.AddProject<Projects.MyApp_Api>("api")
    .WithReference(pythonApi)
    .WithReference(nodeApi);
```

## Aspire 13 新特性

### 简化的 AppHost SDK

```xml
<!-- 只需要一个 SDK -->
<Project Sdk="Aspire.AppHost.Sdk/9.0.0">
    <PropertyGroup>
        <TargetFramework>net10.0</TargetFramework>
    </PropertyGroup>
</Project>
```

### 静态文件网站支持

```csharp
// 添加静态前端
var frontend = builder.AddStaticSite("frontend", "../frontend/dist")
    .WithExternalHttpEndpoints();
```

### 部署并行化

```csharp
// 自动并行化容器部署
builder.Configuration["Aspire:Deployment:Parallelization"] = "true";
```

### 证书信任管理

```csharp
// 资源级别的证书信任
var api = builder.AddProject<Projects.MyApp_Api>("api")
    .WithCertificateTrust(trustMode: CertificateTrustMode.Development);
```

## 最佳实践

### 本地开发

```csharp
// 条件性添加资源
if (builder.Environment.IsDevelopment())
{
    // 开发环境使用容器
    postgres = builder.AddPostgres("postgres");
}
else
{
    // 生产环境使用托管服务
    postgres = builder.AddAzurePostgresFlexibleServer("postgres");
}
```

### 健康检查

```csharp
// 自定义健康检查
builder.Services.AddHealthChecks()
    .AddNpgSql(connectionString, name: "database")
    .AddRedis(redisConnectionString, name: "cache")
    .AddRabbitMQ(rabbitConnectionString, name: "messaging")
    .AddUrlGroup(new Uri("https://api.external.com/health"), name: "external-api");
```

### 资源命名

```csharp
// 使用一致的命名约定
var cache = builder.AddRedis("cache");           // 通用名称
var ordersDb = builder.AddPostgres("orders-db"); // 业务相关名称
var userApi = builder.AddProject("user-api");    // 服务名称
```

## 常用 NuGet 包

| 包名                                     | 用途                  |
| ---------------------------------------- | --------------------- |
| `Aspire.Hosting`                         | AppHost 核心包        |
| `Aspire.Hosting.Redis`                   | Redis 支持            |
| `Aspire.Hosting.PostgreSQL`              | PostgreSQL 支持       |
| `Aspire.Hosting.Azure.*`                 | Azure 资源支持        |
| `Aspire.Hosting.AWS.*`                   | AWS 资源支持          |
| `Aspire.Npgsql`                          | PostgreSQL 客户端集成 |
| `Aspire.StackExchange.Redis`             | Redis 客户端集成      |
| `Aspire.RabbitMQ.Client`                 | RabbitMQ 客户端集成   |
| `Aspire.Microsoft.EntityFrameworkCore.*` | EF Core 集成          |

## 社区资源

- [Aspire Community Toolkit](https://github.com/communitytoolkit/aspire) - 社区扩展
- [Aspire Samples](https://github.com/dotnet/aspire-samples) - 官方示例
- [Aspire Credential](https://aka.ms/aspire-credential) - 官方认证
