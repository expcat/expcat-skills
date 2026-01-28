---
name: dotnet
description: Best practices and guidelines for .NET 10 development including ASP.NET Core web APIs, Entity Framework Core data access, Blazor UI components, .NET MAUI cross-platform apps, AI integration, and cloud-native architecture with .NET Aspire. Use when working with C#, .NET projects, or any Microsoft .NET ecosystem technologies.
license: MIT
metadata:
  author: expcat
  version: '2.0'
  frameworks: '.NET 10+, ASP.NET Core 10, EF Core 10, Blazor 10, MAUI 10, Aspire 13'
---

# .NET Development Best Practices

This skill provides comprehensive guidance for modern .NET 10 development.

## When to Use

Activate this skill when:

- Creating or modifying C# / .NET projects
- Building ASP.NET Core web APIs or web applications
- Working with Entity Framework Core for data access
- Developing Blazor components (Server, WebAssembly, or Hybrid)
- Building cross-platform apps with .NET MAUI
- Building AI-powered applications with Microsoft.Extensions.AI
- Creating cloud-native distributed apps with .NET Aspire
- Setting up dependency injection, logging, or configuration
- Implementing authentication/authorization
- Optimizing performance in .NET applications

## Reference Files

Detailed guidance is available in the `references/` directory:

- [references/dotnet.md](references/dotnet.md) - Core .NET patterns: C# 14 features, project structure, coding conventions, async/await, DI, logging, error handling
- [references/aspnetcore.md](references/aspnetcore.md) - ASP.NET Core 10: minimal APIs, built-in validation, OpenAPI 3.1, SSE, authentication, caching
- [references/efcore.md](references/efcore.md) - Entity Framework Core 10: DbContext, vector search, JSON type, queries, migrations, performance
- [references/blazor.md](references/blazor.md) - Blazor 10: components, declarative state, forms, JS interop, render modes
- [references/maui.md](references/maui.md) - .NET MAUI 10: MVVM, Shell navigation, global XAML, platform-specific code
- [references/ai.md](references/ai.md) - AI Development: Microsoft.Extensions.AI, Agent Framework, MCP, RAG patterns
- [references/aspire.md](references/aspire.md) - .NET Aspire: orchestration, service discovery, telemetry, multi-language support

## Quick Reference

### Project Structure

```
src/
├── Project.Domain/          # Domain models, interfaces
├── Project.Application/     # Business logic, services
├── Project.Infrastructure/  # Data access, external services
├── Project.Api/             # Web API entry point
└── Project.Web/             # Web frontend
tests/
├── Project.UnitTests/
├── Project.IntegrationTests/
└── Project.E2ETests/
```

### Naming Conventions

- Classes/Methods: `PascalCase`
- Private fields: `_camelCase`
- Local variables: `camelCase`
- Interfaces: `IServiceName`
- Async methods: `MethodNameAsync`

### Essential Patterns

**Dependency Injection:**

```csharp
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddSingleton<ICacheService, RedisCacheService>();
```

**Async/Await:**

```csharp
public async Task<User?> GetUserAsync(int id, CancellationToken ct = default)
{
    return await _context.Users.FindAsync(id, ct);
}
```

**Options Pattern:**

```csharp
builder.Services.AddOptions<AppSettings>()
    .BindConfiguration("App")
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

**Structured Logging:**

```csharp
logger.LogInformation("Processing order {OrderId} for {CustomerId}",
    order.Id, order.CustomerId);
```

## Common NuGet Packages

| Package                 | Purpose                     |
| ----------------------- | --------------------------- |
| `Serilog.AspNetCore`    | Structured logging          |
| `FluentValidation`      | Input validation            |
| `Mapster`               | Object mapping              |
| `Polly`                 | Resilience & retry policies |
| `MediatR`               | Mediator pattern / CQRS     |
| `CommunityToolkit.Mvvm` | MVVM for MAUI/WPF           |
