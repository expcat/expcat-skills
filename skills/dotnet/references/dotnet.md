# .NET Best Practices

## Project Structure

```
src/
├── Project.Domain/          # 领域模型、接口
├── Project.Application/     # 业务逻辑、服务
├── Project.Infrastructure/  # 数据访问、外部服务
├── Project.Api/             # Web API
└── Project.Web/             # Web 前端
tests/
├── Project.UnitTests/
└── Project.IntegrationTests/
```

## 命名约定

- 类/方法: `PascalCase`
- 私有字段: `_camelCase`
- 接口: `IServiceName`
- 异步方法: `MethodNameAsync`

## C# 14 新特性

### Field-backed Properties

```csharp
public string Name
{
    get => field;
    set => field = value?.Trim() ?? string.Empty;
}
```

### Extension Members (新语法)

```csharp
static class StringExtensions
{
    extension(string s)
    {
        public bool IsNullOrEmpty => string.IsNullOrEmpty(s);  // 扩展属性
        public string Truncate(int max) => s.Length <= max ? s : s[..max] + "...";
    }
}
// 使用: "hello".IsNullOrEmpty
```

### Null-conditional Assignment

```csharp
config.Settings?.Name = "NewName"; // 仅当 Settings != null 时赋值
```

### Lambda 参数修饰符

```csharp
TryParse<int> parse = (text, out result) => int.TryParse(text, out result);
// 无需指定参数类型即可使用 ref/out/in 修饰符
```

### nameof 支持未绑定泛型

```csharp
var name = nameof(List<>);  // 返回 "List"
```

## 依赖注入

```csharp
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddSingleton<ICacheService, RedisCacheService>();
builder.Services.AddKeyedScoped<INotificationService, EmailService>("email");
```

## 配置管理

```csharp
builder.Services.AddOptions<AppSettings>()
    .BindConfiguration("App")
    .ValidateDataAnnotations()
    .ValidateOnStart();

// 使用
public class MyService(IOptionsMonitor<AppSettings> options)
{
    var settings = options.CurrentValue;
}
```

## 日志记录

```csharp
logger.LogInformation("Processing order {OrderId} for {CustomerId}", order.Id, order.CustomerId);

// 高性能：使用 LoggerMessage 源代码生成器
[LoggerMessage(Level = LogLevel.Information, Message = "Processing order {OrderId}")]
public static partial void LogProcessingOrder(this ILogger logger, int orderId);
```

## 异步编程

```csharp
public async Task<User?> GetUserAsync(int id, CancellationToken ct = default)
{
    return await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
}
```

## Null 处理

```csharp
ArgumentNullException.ThrowIfNull(input);
ArgumentException.ThrowIfNullOrWhiteSpace(input);
var name = user?.Profile?.DisplayName ?? "Unknown";
```

## 错误处理 - Result 模式

```csharp
public class Result<T>
{
    public bool IsSuccess { get; }
    public T? Value { get; }
    public string? Error { get; }
    public static Result<T> Success(T value) => new(true, value, null);
    public static Result<T> Failure(string error) => new(false, default, error);
}
```

## 性能优化

```csharp
// Span 避免分配
public static int CountDigits(ReadOnlySpan<char> input) { ... }

// ArrayPool 复用
var buffer = ArrayPool<byte>.Shared.Rent(1024);
try { /* use */ } finally { ArrayPool<byte>.Shared.Return(buffer); }

// 字符串比较
name.Equals("admin", StringComparison.OrdinalIgnoreCase)
```

## 测试

```csharp
[Fact]
public async Task GetUserAsync_WhenExists_ReturnsUser()
{
    // Arrange
    _mockRepo.Setup(x => x.GetByIdAsync(1, default)).ReturnsAsync(expectedUser);
    // Act
    var result = await _sut.GetUserAsync(1);
    // Assert
    Assert.NotNull(result);
}
```

## 常用 NuGet 包

| Package                   | Purpose     |
| ------------------------- | ----------- |
| `Serilog.AspNetCore`      | 结构化日志  |
| `FluentValidation`        | 验证        |
| `Mapster`                 | 对象映射    |
| `Polly`                   | 弹性/重试   |
| `MediatR`                 | CQRS        |
| `Microsoft.Extensions.AI` | AI 统一抽象 |
