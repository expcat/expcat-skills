# .NET Best Practices

## Project Structure

```
src/
├── Project.Domain/          # 领域模型、接口
├── Project.Application/     # 业务逻辑、服务
├── Project.Infrastructure/  # 数据访问、外部服务
├── Project.Api/            # Web API 入口
└── Project.Web/            # Web 前端
tests/
├── Project.UnitTests/
├── Project.IntegrationTests/
└── Project.E2ETests/
```

## 编码规范

### 命名约定

- 类名、方法名：PascalCase
- 私有字段：`_camelCase` 带下划线前缀
- 局部变量、参数：camelCase
- 常量：PascalCase
- 接口：`I` 前缀，如 `IUserService`
- 异步方法：`Async` 后缀，如 `GetUserAsync`

### 代码风格

```csharp
// ✅ 推荐：使用文件范围命名空间
namespace MyApp.Services;

public class UserService : IUserService
{
    private readonly IUserRepository _userRepository;
    private readonly ILogger<UserService> _logger;

    // 使用主构造函数
    public UserService(IUserRepository userRepository, ILogger<UserService> logger)
    {
        _userRepository = userRepository;
        _logger = logger;
    }
}
```

## C# 14 新特性

### Field-backed Properties

```csharp
// 使用 field 关键字简化属性声明，无需显式定义 backing field
public class User
{
    // 自动生成 backing field，可在访问器中使用 field 关键字
    public string Name
    {
        get => field;
        set => field = value?.Trim() ?? string.Empty;
    }

    // 带验证的属性
    public int Age
    {
        get => field;
        set => field = value >= 0 ? value : throw new ArgumentException("Age cannot be negative");
    }

    // 惰性初始化
    public string FullDescription => field ??= ComputeExpensiveDescription();
}
```

### Extension Blocks

```csharp
// 新的扩展语法：支持静态扩展方法和扩展属性
static class StringExtensions
{
    extension(string s)
    {
        // 扩展属性
        public bool IsNullOrEmpty => string.IsNullOrEmpty(s);
        public bool IsNullOrWhiteSpace => string.IsNullOrWhiteSpace(s);

        // 扩展方法
        public string Truncate(int maxLength) =>
            s.Length <= maxLength ? s : s[..maxLength] + "...";
    }
}

static class ListExtensions
{
    extension<T>(List<T> list)
    {
        public int Sum where T : INumber<T> => list.Aggregate(T.Zero, (a, b) => a + b);
        public bool IsEmpty => list.Count == 0;
    }
}

// 使用
var name = "Hello World";
if (!name.IsNullOrEmpty)
{
    Console.WriteLine(name.Truncate(5)); // "Hello..."
}
```

### Null-conditional Assignment

```csharp
// 使用 ?.= 进行 null 安全赋值
public class Config
{
    public Settings? Settings { get; set; }
}

var config = new Config();

// 仅当 Settings 不为 null 时才赋值
config.Settings?.Name = "NewName";

// 等价于
if (config.Settings is not null)
{
    config.Settings.Name = "NewName";
}
```

### First-class Span Conversions

```csharp
// Span<T> 和 ReadOnlySpan<T> 现在支持隐式转换
void ProcessData(ReadOnlySpan<byte> data) { }

byte[] array = [1, 2, 3, 4, 5];
Span<byte> span = array;

// 隐式转换 - 无需显式转换
ProcessData(array);  // byte[] -> ReadOnlySpan<byte>
ProcessData(span);   // Span<byte> -> ReadOnlySpan<byte>

// 在方法重载中优先选择 Span 版本以获得更好性能
public void Write(ReadOnlySpan<char> text) { } // 优先选择
public void Write(string text) { }
```

### Partial Properties and Constructors

```csharp
// 部分属性和构造函数
public partial class GeneratedModel
{
    // 部分属性声明
    public partial string Name { get; set; }

    // 部分构造函数
    public partial GeneratedModel(string name);
}

// 实现部分
public partial class GeneratedModel
{
    private string _name = string.Empty;

    public partial string Name
    {
        get => _name;
        set
        {
            if (_name != value)
            {
                _name = value;
                OnPropertyChanged();
            }
        }
    }

    public partial GeneratedModel(string name)
    {
        Name = name;
    }
}
```

### 异步编程

```csharp
// ✅ 推荐
public async Task<User?> GetUserAsync(int id, CancellationToken cancellationToken = default)
{
    return await _dbContext.Users
        .FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
}

// ❌ 避免
public Task<User?> GetUser(int id)
{
    return _dbContext.Users.FirstOrDefaultAsync(u => u.Id == id);
}
```

### Null 处理

```csharp
// 启用 nullable reference types
#nullable enable

// 使用 null 条件运算符
var name = user?.Profile?.DisplayName ?? "Unknown";

// 使用 ArgumentNullException.ThrowIfNull (C# 10+)
public void Process(string input)
{
    ArgumentNullException.ThrowIfNull(input);
    ArgumentException.ThrowIfNullOrWhiteSpace(input);
}
```

## 依赖注入

```csharp
// 注册服务
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddSingleton<ICacheService, RedisCacheService>();
builder.Services.AddTransient<IEmailSender, SmtpEmailSender>();

// 使用 Options 模式配置
builder.Services.Configure<SmtpSettings>(
    builder.Configuration.GetSection("Smtp"));

// 使用 Keyed Services
builder.Services.AddKeyedScoped<INotificationService, EmailService>("email");
builder.Services.AddKeyedScoped<INotificationService, SmsService>("sms");
```

## 配置管理

```csharp
// appsettings.json 结构化配置
public class AppSettings
{
    public required string ApiKey { get; init; }
    public int MaxRetries { get; init; } = 3;
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(30);
}

// 绑定配置
builder.Services.AddOptions<AppSettings>()
    .BindConfiguration("App")
    .ValidateDataAnnotations()
    .ValidateOnStart();

// 使用 IOptionsMonitor 支持热重载
public class MyService(IOptionsMonitor<AppSettings> options)
{
    public void DoWork()
    {
        var settings = options.CurrentValue;
    }
}
```

## 日志记录

```csharp
// 使用结构化日志
public class OrderService(ILogger<OrderService> logger)
{
    public async Task ProcessOrderAsync(Order order)
    {
        logger.LogInformation("Processing order {OrderId} for customer {CustomerId}",
            order.Id, order.CustomerId);

        try
        {
            // 处理逻辑
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to process order {OrderId}", order.Id);
            throw;
        }
    }
}

// 使用 LoggerMessage 源代码生成器提升性能
public static partial class LogMessages
{
    [LoggerMessage(Level = LogLevel.Information, Message = "Processing order {OrderId}")]
    public static partial void LogProcessingOrder(this ILogger logger, int orderId);
}
```

## 错误处理

```csharp
// 自定义异常
public class DomainException : Exception
{
    public string Code { get; }

    public DomainException(string code, string message) : base(message)
    {
        Code = code;
    }
}

// 使用 Result 模式替代异常
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
// 使用 Span<T> 避免分配
public static int CountDigits(ReadOnlySpan<char> input)
{
    int count = 0;
    foreach (var c in input)
    {
        if (char.IsDigit(c)) count++;
    }
    return count;
}

// 使用 ArrayPool 复用数组
var buffer = ArrayPool<byte>.Shared.Rent(1024);
try
{
    // 使用 buffer
}
finally
{
    ArrayPool<byte>.Shared.Return(buffer);
}

// 使用 StringComparison 进行字符串比较
if (name.Equals("admin", StringComparison.OrdinalIgnoreCase))
{
    // ...
}
```

## 测试

```csharp
// 单元测试使用 xUnit + Moq/NSubstitute
public class UserServiceTests
{
    private readonly Mock<IUserRepository> _mockRepo = new();
    private readonly UserService _sut;

    public UserServiceTests()
    {
        _sut = new UserService(_mockRepo.Object, NullLogger<UserService>.Instance);
    }

    [Fact]
    public async Task GetUserAsync_WhenUserExists_ReturnsUser()
    {
        // Arrange
        var expectedUser = new User { Id = 1, Name = "Test" };
        _mockRepo.Setup(x => x.GetByIdAsync(1, default))
            .ReturnsAsync(expectedUser);

        // Act
        var result = await _sut.GetUserAsync(1);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Test", result.Name);
    }
}
```

## 常用 NuGet 包

- `Serilog.AspNetCore` - 结构化日志
- `FluentValidation` - 验证
- `Mapster` / `AutoMapper` - 对象映射
- `Polly` - 弹性和瞬态故障处理
- `MediatR` - 中介者模式/CQRS
- `Bogus` - 测试数据生成
- `BenchmarkDotNet` - 性能基准测试
- `Microsoft.Extensions.AI` - AI 服务统一抽象
- `CommunityToolkit.Mvvm` - MVVM 源代码生成器
