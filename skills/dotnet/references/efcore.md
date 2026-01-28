# Entity Framework Core Best Practices

## DbContext 配置

```csharp
// DbContext 定义
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<Product> Products => Set<Product>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // 应用所有配置类
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        // 全局查询过滤器
        modelBuilder.Entity<User>().HasQueryFilter(u => !u.IsDeleted);
    }

    // 重写 SaveChanges 实现审计
    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        foreach (var entry in ChangeTracker.Entries<IAuditableEntity>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Entity.CreatedAt = DateTime.UtcNow;
                    break;
                case EntityState.Modified:
                    entry.Entity.UpdatedAt = DateTime.UtcNow;
                    break;
            }
        }

        return base.SaveChangesAsync(cancellationToken);
    }
}

// 注册 DbContext
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString, sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure(3);
        sqlOptions.CommandTimeout(30);
    });

    // 开发环境启用敏感数据日志
    if (builder.Environment.IsDevelopment())
    {
        options.EnableSensitiveDataLogging();
        options.EnableDetailedErrors();
    }
});
```

## 实体配置

```csharp
// 实体类设计
public class Order
{
    public int Id { get; private set; }
    public DateTime OrderDate { get; private set; }
    public OrderStatus Status { get; private set; }
    public decimal TotalAmount { get; private set; }

    // 导航属性
    public int CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;

    // 集合导航属性 - 使用私有字段
    private readonly List<OrderItem> _items = new();
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    // 工厂方法
    public static Order Create(int customerId)
    {
        return new Order
        {
            CustomerId = customerId,
            OrderDate = DateTime.UtcNow,
            Status = OrderStatus.Pending
        };
    }

    // 领域方法
    public void AddItem(Product product, int quantity)
    {
        var item = new OrderItem(Id, product.Id, product.Price, quantity);
        _items.Add(item);
        RecalculateTotal();
    }

    private void RecalculateTotal()
    {
        TotalAmount = _items.Sum(i => i.Quantity * i.UnitPrice);
    }
}

// Fluent API 配置
public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("Orders");

        builder.HasKey(o => o.Id);

        builder.Property(o => o.TotalAmount)
            .HasPrecision(18, 2);

        builder.Property(o => o.Status)
            .HasConversion<string>()
            .HasMaxLength(20);

        // 关系配置
        builder.HasOne(o => o.Customer)
            .WithMany(c => c.Orders)
            .HasForeignKey(o => o.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);

        // 私有字段映射
        builder.HasMany(o => o.Items)
            .WithOne()
            .HasForeignKey(i => i.OrderId);

        builder.Navigation(o => o.Items)
            .UsePropertyAccessMode(PropertyAccessMode.Field);

        // 索引
        builder.HasIndex(o => o.OrderDate);
        builder.HasIndex(o => new { o.CustomerId, o.Status });
    }
}
```

## 查询优化

```csharp
// ✅ 推荐：只查询需要的字段
var userDtos = await _context.Users
    .Where(u => u.IsActive)
    .Select(u => new UserDto
    {
        Id = u.Id,
        Name = u.Name,
        Email = u.Email
    })
    .ToListAsync(cancellationToken);

// ✅ 推荐：使用 AsNoTracking 进行只读查询
var users = await _context.Users
    .AsNoTracking()
    .Where(u => u.IsActive)
    .ToListAsync(cancellationToken);

// ✅ 推荐：显式加载关联数据
var order = await _context.Orders
    .Include(o => o.Items)
        .ThenInclude(i => i.Product)
    .Include(o => o.Customer)
    .FirstOrDefaultAsync(o => o.Id == orderId, cancellationToken);

// ✅ 推荐：过滤 Include
var orders = await _context.Orders
    .Include(o => o.Items.Where(i => i.Quantity > 0))
    .ToListAsync(cancellationToken);

// ✅ 推荐：分页查询
var pagedUsers = await _context.Users
    .OrderBy(u => u.Name)
    .Skip((page - 1) * pageSize)
    .Take(pageSize)
    .ToListAsync(cancellationToken);

// ✅ 推荐：使用 AsSplitQuery 避免笛卡尔爆炸
var ordersWithDetails = await _context.Orders
    .Include(o => o.Items)
    .Include(o => o.Shipments)
    .AsSplitQuery()
    .ToListAsync(cancellationToken);

// ❌ 避免：N+1 查询问题
foreach (var order in orders)
{
    // 每次循环都会产生一次数据库查询
    var items = order.Items.ToList();
}
```

## 批量操作

```csharp
// ✅ 批量更新
await _context.Users
    .Where(u => u.LastLoginDate < DateTime.UtcNow.AddYears(-1))
    .ExecuteUpdateAsync(s => s
        .SetProperty(u => u.IsActive, false)
        .SetProperty(u => u.DeactivatedAt, DateTime.UtcNow),
        cancellationToken);

// ✅ 批量删除
await _context.Logs
    .Where(l => l.CreatedAt < DateTime.UtcNow.AddMonths(-6))
    .ExecuteDeleteAsync(cancellationToken);

// ✅ 批量插入 - 使用 AddRange
var newUsers = GenerateUsers(1000);
await _context.Users.AddRangeAsync(newUsers, cancellationToken);
await _context.SaveChangesAsync(cancellationToken);

// ✅ 大量数据使用 EFCore.BulkExtensions
await _context.BulkInsertAsync(largeDataSet, cancellationToken);
await _context.BulkUpdateAsync(updatedRecords, cancellationToken);
```

## 原始 SQL 查询

```csharp
// 参数化查询（防 SQL 注入）
var users = await _context.Users
    .FromSqlInterpolated($"SELECT * FROM Users WHERE Name LIKE {searchTerm + "%"}")
    .ToListAsync(cancellationToken);

// 使用原始 SQL 执行复杂查询
var statistics = await _context.Database
    .SqlQuery<OrderStatistics>($"""
        SELECT
            YEAR(OrderDate) as Year,
            MONTH(OrderDate) as Month,
            COUNT(*) as OrderCount,
            SUM(TotalAmount) as TotalRevenue
        FROM Orders
        WHERE CustomerId = {customerId}
        GROUP BY YEAR(OrderDate), MONTH(OrderDate)
        ORDER BY Year DESC, Month DESC
        """)
    .ToListAsync(cancellationToken);
```

## 事务处理

```csharp
// 显式事务
await using var transaction = await _context.Database.BeginTransactionAsync(cancellationToken);

try
{
    var order = Order.Create(customerId);
    _context.Orders.Add(order);
    await _context.SaveChangesAsync(cancellationToken);

    // 扣减库存
    await _context.Products
        .Where(p => productIds.Contains(p.Id))
        .ExecuteUpdateAsync(s => s
            .SetProperty(p => p.Stock, p => p.Stock - 1),
            cancellationToken);

    await transaction.CommitAsync(cancellationToken);
}
catch
{
    await transaction.RollbackAsync(cancellationToken);
    throw;
}

// 使用执行策略处理重试
var strategy = _context.Database.CreateExecutionStrategy();

await strategy.ExecuteAsync(async () =>
{
    await using var transaction = await _context.Database.BeginTransactionAsync();
    // 事务操作
    await transaction.CommitAsync();
});
```

## 并发控制

```csharp
// 乐观并发 - 使用行版本
public class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }

    [Timestamp]
    public byte[] RowVersion { get; set; } = null!;
}

// 配置
builder.Property(p => p.RowVersion)
    .IsRowVersion();

// 处理并发冲突
try
{
    await _context.SaveChangesAsync(cancellationToken);
}
catch (DbUpdateConcurrencyException ex)
{
    foreach (var entry in ex.Entries)
    {
        var databaseValues = await entry.GetDatabaseValuesAsync(cancellationToken);

        if (databaseValues is null)
        {
            // 记录已被删除
            throw new NotFoundException("Record was deleted");
        }

        // 客户端获胜 - 覆盖数据库值
        entry.OriginalValues.SetValues(databaseValues);

        // 或 数据库获胜 - 放弃客户端更改
        // entry.CurrentValues.SetValues(databaseValues);
        // entry.State = EntityState.Unchanged;
    }

    await _context.SaveChangesAsync(cancellationToken);
}
```

## Repository 模式

```csharp
// 通用仓储接口
public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<T>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<T> AddAsync(T entity, CancellationToken cancellationToken = default);
    Task UpdateAsync(T entity, CancellationToken cancellationToken = default);
    Task DeleteAsync(T entity, CancellationToken cancellationToken = default);
}

// 规约模式
public interface ISpecification<T>
{
    Expression<Func<T, bool>>? Criteria { get; }
    List<Expression<Func<T, object>>> Includes { get; }
    List<string> IncludeStrings { get; }
    Expression<Func<T, object>>? OrderBy { get; }
    Expression<Func<T, object>>? OrderByDescending { get; }
    int? Skip { get; }
    int? Take { get; }
}

// 使用规约
public class ActiveUsersSpecification : Specification<User>
{
    public ActiveUsersSpecification(int pageIndex, int pageSize)
    {
        Criteria = u => u.IsActive;
        OrderBy = u => u.Name;
        ApplyPaging(pageIndex * pageSize, pageSize);
    }
}

var activeUsers = await _repository.ListAsync(new ActiveUsersSpecification(0, 10));
```

## 迁移管理

```bash
# 创建迁移
dotnet ef migrations add InitialCreate

# 应用迁移
dotnet ef database update

# 生成 SQL 脚本
dotnet ef migrations script --idempotent -o migration.sql

# 回滚到指定迁移
dotnet ef database update PreviousMigration
```

```csharp
// 程序启动时自动迁移（仅开发环境）
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await dbContext.Database.MigrateAsync();
}

// 生产环境使用 SQL 脚本或迁移工具
```

## 性能诊断

```csharp
// 启用查询日志
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString);

    // 记录慢查询
    options.LogTo(
        filter: (eventId, level) => eventId.Id == CoreEventId.QueryExecutionPlanned.Id,
        logger: message => Console.WriteLine(message));

    // 添加查询标签便于诊断
    options.AddInterceptors(new QueryTaggingInterceptor());
});

// 查询标签拦截器
public class QueryTaggingInterceptor : DbCommandInterceptor
{
    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result)
    {
        command.CommandText = $"-- Source: {eventData.Context?.GetType().Name}\n" +
                              command.CommandText;
        return result;
    }
}

// 使用 TagWith 标记查询
var orders = await _context.Orders
    .TagWith("GetRecentOrders - OrderService.GetRecentAsync")
    .Where(o => o.OrderDate > DateTime.UtcNow.AddDays(-30))
    .ToListAsync(cancellationToken);
```

## DbContext 池化

```csharp
// 使用 DbContext 池提升性能
builder.Services.AddDbContextPool<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString);
}, poolSize: 128);

// 或使用工厂模式
builder.Services.AddPooledDbContextFactory<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString);
});

// 在服务中使用工厂
public class OrderService
{
    private readonly IDbContextFactory<AppDbContext> _contextFactory;

    public OrderService(IDbContextFactory<AppDbContext> contextFactory)
    {
        _contextFactory = contextFactory;
    }

    public async Task<Order?> GetOrderAsync(int id)
    {
        await using var context = await _contextFactory.CreateDbContextAsync();
        return await context.Orders.FindAsync(id);
    }
}
```

## EF Core 10 新特性

### Vector Search 支持 (SQL Server 2025 / Azure SQL)

```csharp
// 定义带向量字段的实体
public class Document
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;

    // 向量嵌入字段
    public float[] Embedding { get; set; } = [];
}

// 配置向量列
public class DocumentConfiguration : IEntityTypeConfiguration<Document>
{
    public void Configure(EntityTypeBuilder<Document> builder)
    {
        builder.Property(d => d.Embedding)
            .HasColumnType("vector(1536)"); // OpenAI ada-002 维度
    }
}

// 向量相似度搜索
var queryEmbedding = await GetEmbeddingAsync("search query");

var similarDocs = await _context.Documents
    .OrderBy(d => EF.Functions.VectorDistance(d.Embedding, queryEmbedding))
    .Take(10)
    .ToListAsync();

// 使用 VECTOR_DISTANCE 函数
var results = await _context.Documents
    .Where(d => EF.Functions.VectorDistance(d.Embedding, queryEmbedding) < 0.5f)
    .Select(d => new
    {
        d.Title,
        Distance = EF.Functions.VectorDistance(d.Embedding, queryEmbedding)
    })
    .ToListAsync();
```

### 原生 JSON 类型 (SQL Server 2025)

```csharp
// 自动使用 SQL Server 2025 的原生 json 数据类型
public class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    // 映射到原生 json 列
    public ProductDetails Details { get; set; } = new();
}

public class ProductDetails
{
    public string Description { get; set; } = string.Empty;
    public List<string> Tags { get; set; } = [];
    public Dictionary<string, string> Attributes { get; set; } = [];
}

// 完整 LINQ 支持，使用 JSON_VALUE 和 RETURNING 子句
var products = await _context.Products
    .Where(p => p.Details.Tags.Contains("electronics"))
    .Select(p => new
    {
        p.Name,
        p.Details.Description,
        TagCount = p.Details.Tags.Count
    })
    .ToListAsync();
```

### 命名查询过滤器

```csharp
// 定义多个命名过滤器
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    modelBuilder.Entity<Order>()
        .HasQueryFilter("SoftDelete", o => !o.IsDeleted)
        .HasQueryFilter("TenantFilter", o => o.TenantId == _tenantId)
        .HasQueryFilter("ActiveOnly", o => o.Status != OrderStatus.Cancelled);
}

// 选择性禁用特定过滤器
var allOrders = await _context.Orders
    .IgnoreQueryFilters("SoftDelete") // 只禁用软删除过滤器
    .ToListAsync();

var deletedOrders = await _context.Orders
    .IgnoreQueryFilters("SoftDelete", "ActiveOnly") // 禁用多个
    .Where(o => o.IsDeleted)
    .ToListAsync();
```

### LeftJoin 和 RightJoin 支持

```csharp
// 使用新的 LeftJoin 操作符
var ordersWithCustomers = await _context.Orders
    .LeftJoin(
        _context.Customers,
        order => order.CustomerId,
        customer => customer.Id,
        (order, customer) => new
        {
            OrderId = order.Id,
            OrderDate = order.OrderDate,
            CustomerName = customer != null ? customer.Name : "Guest"
        })
    .ToListAsync();

// RightJoin 同理
var customersWithOrders = await _context.Orders
    .RightJoin(
        _context.Customers,
        order => order.CustomerId,
        customer => customer.Id,
        (order, customer) => new
        {
            customer.Name,
            HasOrders = order != null
        })
    .ToListAsync();
```

### ExecuteUpdate for JSON 列

```csharp
// 批量更新 JSON 列中的属性
await _context.Products
    .Where(p => p.Category == "Electronics")
    .ExecuteUpdateAsync(s => s
        .SetProperty(p => p.Details.Views, p => p.Details.Views + 1)
        .SetProperty(p => p.Details.LastUpdated, DateTime.UtcNow));

// 更新嵌套属性
await _context.Blogs
    .Where(b => b.Id == blogId)
    .ExecuteUpdateAsync(s => s
        .SetProperty(b => b.Metadata.Author.Name, "New Author")
        .SetProperty(b => b.Metadata.Tags, new List<string> { "updated", "blog" }));
```

### 可选复杂类型 (Optional Complex Types)

```csharp
// 复杂类型现在可以为 null
public class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    // 可选的复杂类型
    public Address? ShippingAddress { get; set; }
    public Address? BillingAddress { get; set; }
}

[ComplexType]
public class Address
{
    public string Street { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string PostalCode { get; set; } = string.Empty;
}

// 查询可选复杂类型
var customersWithShipping = await _context.Customers
    .Where(c => c.ShippingAddress != null)
    .ToListAsync();
```

### 改进的参数化集合查询

```csharp
// 改进的集合参数化，优化查询计划缓存
var ids = new[] { 1, 2, 3, 4, 5 };

// 新的默认翻译：每个值作为单独参数发送
// 带填充以优化查询计划缓存，同时保留基数信息
var users = await _context.Users
    .Where(u => ids.Contains(u.Id))
    .ToListAsync();
// 生成: WHERE Id IN (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7) -- 填充到 8
```

### Cosmos DB 增强

```csharp
// 全文搜索支持
var results = await _context.Products
    .Where(p => EF.Functions.FullTextContains(p.Description, "laptop"))
    .OrderByDescending(p => EF.Functions.FullTextScore(p.Description, "laptop"))
    .ToListAsync();

// 混合搜索：结合向量和全文搜索
var hybridResults = await _context.Products
    .OrderBy(p => EF.Functions.RRF(
        EF.Functions.VectorDistance(p.Embedding, queryVector),
        EF.Functions.FullTextScore(p.Description, searchTerm)))
    .Take(10)
    .ToListAsync();
```
