# Entity Framework Core Best Practices

## DbContext 配置

```csharp
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
        modelBuilder.Entity<User>().HasQueryFilter(u => !u.IsDeleted); // 全局过滤
    }
}

// 注册
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlServer(connStr, sql => {
    sql.EnableRetryOnFailure(3);
    sql.CommandTimeout(30);
}));
```

## 实体配置

```csharp
public class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.HasKey(o => o.Id);
        builder.Property(o => o.TotalAmount).HasPrecision(18, 2);
        builder.HasOne(o => o.Customer).WithMany(c => c.Orders).HasForeignKey(o => o.CustomerId);
        builder.HasIndex(o => o.OrderDate);
    }
}
```

## 查询优化

```csharp
// ✅ 只查需要的字段
var dtos = await _context.Users.Where(u => u.IsActive)
    .Select(u => new UserDto { Id = u.Id, Name = u.Name }).ToListAsync(ct);

// ✅ 只读查询
var users = await _context.Users.AsNoTracking().ToListAsync(ct);

// ✅ 显式 Include
var order = await _context.Orders.Include(o => o.Items).ThenInclude(i => i.Product).FirstOrDefaultAsync(o => o.Id == id, ct);

// ✅ 避免笛卡尔爆炸
var orders = await _context.Orders.Include(o => o.Items).Include(o => o.Shipments).AsSplitQuery().ToListAsync(ct);

// ✅ 分页
var paged = await _context.Users.OrderBy(u => u.Name).Skip((page - 1) * size).Take(size).ToListAsync(ct);
```

## 批量操作

```csharp
// 批量更新
await _context.Users.Where(u => u.LastLogin < DateTime.UtcNow.AddYears(-1))
    .ExecuteUpdateAsync(s => s.SetProperty(u => u.IsActive, false), ct);

// 批量删除
await _context.Logs.Where(l => l.CreatedAt < DateTime.UtcNow.AddMonths(-6)).ExecuteDeleteAsync(ct);
```

## 事务

```csharp
await using var transaction = await _context.Database.BeginTransactionAsync(ct);
try
{
    // 操作...
    await _context.SaveChangesAsync(ct);
    await transaction.CommitAsync(ct);
}
catch { await transaction.RollbackAsync(ct); throw; }
```

## 并发控制

```csharp
[Timestamp] public byte[] RowVersion { get; set; } = null!;

// 处理冲突
try { await _context.SaveChangesAsync(ct); }
catch (DbUpdateConcurrencyException ex)
{
    var entry = ex.Entries.Single();
    var dbValues = await entry.GetDatabaseValuesAsync(ct);
    entry.OriginalValues.SetValues(dbValues!); // 客户端获胜
    await _context.SaveChangesAsync(ct);
}
```

## DbContext 池化

```csharp
builder.Services.AddPooledDbContextFactory<AppDbContext>(o => o.UseSqlServer(connStr));

// 使用
public class OrderService(IDbContextFactory<AppDbContext> factory)
{
    public async Task<Order?> Get(int id)
    {
        await using var ctx = await factory.CreateDbContextAsync();
        return await ctx.Orders.FindAsync(id);
    }
}
```

## EF Core 10 新特性

### Vector Search (SQL Server 2025 / Azure SQL)

```csharp
// 使用 SqlVector<float> 类型
[Column(TypeName = "vector(1536)")]
public SqlVector<float> Embedding { get; set; }

// 插入向量
var embedding = await embeddingGenerator.GenerateVectorAsync("text");
context.Docs.Add(new Doc { Embedding = new SqlVector<float>(embedding) });

// 相似度搜索
var similar = await _context.Documents
    .OrderBy(d => EF.Functions.VectorDistance("cosine", d.Embedding, queryVector))
    .Take(10).ToListAsync();
```

### 原生 JSON 类型 (SQL Server 2025)

```csharp
// 自动使用 json 数据类型 (兼容级别 170+)
var products = await _context.Products
    .Where(p => p.Details.Tags.Contains("electronics"))
    .ToListAsync();

// 批量更新 JSON 属性 (使用 modify 函数)
await _context.Products.ExecuteUpdateAsync(s => s.SetProperty(p => p.Details.Views, p => p.Details.Views + 1));
```

### LeftJoin / RightJoin

```csharp
var result = await _context.Orders.LeftJoin(_context.Customers,
    o => o.CustomerId, c => c.Id,
    (order, customer) => new { order.Id, CustomerName = customer != null ? customer.Name : "Guest" }).ToListAsync();
```

## 迁移

```bash
dotnet ef migrations add InitialCreate
dotnet ef database update
dotnet ef migrations script --idempotent -o migration.sql
```
