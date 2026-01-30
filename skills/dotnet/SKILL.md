---
name: dotnet
description: Best practices for .NET 10 development covering ASP.NET Core APIs, Entity Framework Core, Blazor, .NET MAUI, AI integration with Microsoft.Extensions.AI, and cloud-native apps with .NET Aspire. Use when working with C#, .NET projects, NuGet packages, or Microsoft .NET ecosystem.
license: MIT
metadata:
  author: expcat
  version: '2.1'
---

# .NET Development Best Practices

Comprehensive guidance for modern .NET 10 development.

## When to Use

Activate when:

- Creating/modifying C#/.NET projects
- Building ASP.NET Core APIs or web apps
- Working with Entity Framework Core
- Developing Blazor components
- Building .NET MAUI cross-platform apps
- Integrating AI with Microsoft.Extensions.AI
- Creating cloud-native apps with .NET Aspire

## Reference Files

Load specific references as needed:

| Reference                                 | Topics                                           |
| ----------------------------------------- | ------------------------------------------------ |
| [dotnet.md](references/dotnet.md)         | C# 14, project structure, DI, async, logging     |
| [aspnetcore.md](references/aspnetcore.md) | Minimal APIs, validation, OpenAPI, auth, caching |
| [efcore.md](references/efcore.md)         | DbContext, vector search, JSON, migrations       |
| [blazor.md](references/blazor.md)         | Components, state, forms, render modes           |
| [maui.md](references/maui.md)             | MVVM, Shell navigation, platform code            |
| [ai.md](references/ai.md)                 | Microsoft.Extensions.AI, Agent Framework, MCP    |
| [aspire.md](references/aspire.md)         | Orchestration, service discovery, telemetry      |

## Essential Packages

`Serilog.AspNetCore` `FluentValidation` `Mapster` `Polly` `MediatR` `CommunityToolkit.Mvvm` `Microsoft.Extensions.AI`
