# .NET AI Development Best Practices

## 概述

.NET 10 提供了全面的 AI 开发支持，从简单的 AI 服务集成到复杂的多代理系统构建。

## Microsoft.Extensions.AI

统一的 AI 服务抽象层，支持多种 AI 提供商。

### 基础配置

```csharp
// 安装包
// dotnet add package Microsoft.Extensions.AI
// dotnet add package Microsoft.Extensions.AI.OpenAI
// dotnet add package Microsoft.Extensions.AI.AzureAIInference

// 注册 AI 服务
builder.Services.AddChatClient(sp =>
{
    var client = new AzureOpenAIClient(
        new Uri(config["AzureOpenAI:Endpoint"]!),
        new AzureKeyCredential(config["AzureOpenAI:Key"]!));

    return client.AsChatClient("gpt-4o");
});

// 或使用 Ollama 本地模型
builder.Services.AddChatClient(sp =>
{
    return new OllamaChatClient(new Uri("http://localhost:11434"), "llama3.2");
});
```

### IChatClient 使用

```csharp
public class ChatService(IChatClient chatClient)
{
    // 简单对话
    public async Task<string> GetResponseAsync(string message)
    {
        var response = await chatClient.CompleteAsync(message);
        return response.Message.Text ?? "";
    }

    // 带历史的对话
    public async Task<string> ChatAsync(List<ChatMessage> history, string userMessage)
    {
        history.Add(new ChatMessage(ChatRole.User, userMessage));

        var response = await chatClient.CompleteAsync(history);
        var assistantMessage = response.Message;

        history.Add(assistantMessage);
        return assistantMessage.Text ?? "";
    }

    // 流式响应
    public async IAsyncEnumerable<string> StreamResponseAsync(
        string message,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        await foreach (var chunk in chatClient.CompleteStreamingAsync(message, cancellationToken: ct))
        {
            if (chunk.Text is not null)
            {
                yield return chunk.Text;
            }
        }
    }

    // 带选项的请求
    public async Task<string> GetStructuredResponseAsync(string message)
    {
        var options = new ChatOptions
        {
            Temperature = 0.7f,
            MaxOutputTokens = 1000,
            ResponseFormat = ChatResponseFormat.Json
        };

        var response = await chatClient.CompleteAsync(message, options);
        return response.Message.Text ?? "";
    }
}
```

### 中间件管道

```csharp
// 添加缓存、日志等中间件
builder.Services.AddChatClient(sp =>
{
    var innerClient = new AzureOpenAIClient(endpoint, credential)
        .AsChatClient("gpt-4o");

    return new ChatClientBuilder(innerClient)
        .UseLogging(sp.GetRequiredService<ILoggerFactory>())
        .UseDistributedCache(sp.GetRequiredService<IDistributedCache>())
        .UseOpenTelemetry(sp.GetRequiredService<ILoggerFactory>())
        .UseRetry(maxRetries: 3)
        .Build();
});

// 自定义中间件
public class ContentFilterMiddleware : DelegatingChatClient
{
    public ContentFilterMiddleware(IChatClient innerClient) : base(innerClient) { }

    public override async Task<ChatCompletion> CompleteAsync(
        IList<ChatMessage> chatMessages,
        ChatOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        // 过滤输入
        foreach (var message in chatMessages)
        {
            // 检查敏感内容
        }

        var response = await base.CompleteAsync(chatMessages, options, cancellationToken);

        // 过滤输出
        return response;
    }
}
```

### 嵌入和向量搜索

```csharp
// IEmbeddingGenerator 接口
builder.Services.AddSingleton<IEmbeddingGenerator<string, Embedding<float>>>(sp =>
{
    var client = new AzureOpenAIClient(endpoint, credential);
    return client.AsEmbeddingGenerator("text-embedding-3-small");
});

public class SemanticSearchService(
    IEmbeddingGenerator<string, Embedding<float>> embeddings,
    IVectorStore vectorStore)
{
    public async Task IndexDocumentAsync(Document doc)
    {
        var embedding = await embeddings.GenerateEmbeddingAsync(doc.Content);

        await vectorStore.UpsertAsync(new VectorRecord
        {
            Id = doc.Id,
            Vector = embedding.Vector,
            Metadata = new { doc.Title, doc.Category }
        });
    }

    public async Task<List<Document>> SearchAsync(string query, int topK = 10)
    {
        var queryEmbedding = await embeddings.GenerateEmbeddingAsync(query);

        var results = await vectorStore.SearchAsync(
            queryEmbedding.Vector,
            topK: topK);

        return results.Select(r => r.Document).ToList();
    }
}
```

## Microsoft Agent Framework

构建智能多代理系统的框架。

### 创建代理

```csharp
// 安装包
// dotnet add package Microsoft.Agents.AI

// 简单代理
IChatClient chatClient = /* ... */;

AIAgent writer = new ChatClientAgent(
    chatClient,
    new ChatClientAgentOptions
    {
        Name = "Writer",
        Instructions = "你是一个专业的技术文档撰写者。写作风格简洁、准确。"
    });

AIAgent reviewer = new ChatClientAgent(
    chatClient,
    new ChatClientAgentOptions
    {
        Name = "Reviewer",
        Instructions = "你是一个严格的技术文档审核者。检查准确性、清晰度和完整性。"
    });
```

### 工作流编排

```csharp
// 顺序工作流
Workflow sequentialWorkflow = AgentWorkflowBuilder
    .BuildSequential(writer, reviewer);

AIAgent workflowAgent = await sequentialWorkflow.AsAgentAsync();
var result = await workflowAgent.InvokeAsync("写一篇关于 .NET 10 新特性的文章");

// 并行工作流
Workflow parallelWorkflow = AgentWorkflowBuilder
    .BuildConcurrent(researcher1, researcher2, researcher3);

// 交接工作流
Workflow handoffWorkflow = AgentWorkflowBuilder
    .BuildHandoff(
        router,
        new Dictionary<string, AIAgent>
        {
            ["technical"] = technicalWriter,
            ["marketing"] = marketingWriter,
            ["legal"] = legalReviewer
        });

// 组合工作流
Workflow complexWorkflow = AgentWorkflowBuilder
    .BuildSequential(
        AgentWorkflowBuilder.BuildConcurrent(researcher1, researcher2),
        writer,
        reviewer);
```

### 工具集成

```csharp
// 定义工具
[Description("搜索知识库")]
public async Task<string> SearchKnowledgeBase(
    [Description("搜索查询")] string query,
    [Description("返回结果数量")] int topK = 5)
{
    var results = await _searchService.SearchAsync(query, topK);
    return JsonSerializer.Serialize(results);
}

// 注册工具到代理
var agent = new ChatClientAgent(
    chatClient,
    new ChatClientAgentOptions
    {
        Name = "ResearchAssistant",
        Instructions = "你是一个研究助手，使用知识库回答问题。",
        Tools = [AIFunctionFactory.Create(SearchKnowledgeBase)]
    });
```

### ASP.NET Core 集成

```csharp
// 使用 AI Agent Web API 模板
// dotnet new install Microsoft.Agents.AI.ProjectTemplates
// dotnet new aiagent-webapi -o MyAgentApi

// Program.cs
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddAgentFramework()
    .AddAgent<WriterAgent>()
    .AddAgent<ReviewerAgent>()
    .AddWorkflow<DocumentWorkflow>();

var app = builder.Build();

// 映射代理端点
app.MapAgentEndpoint("/agents/writer", "WriterAgent");
app.MapAgentEndpoint("/agents/workflow", "DocumentWorkflow");

app.Run();
```

### AG-UI 协议支持

```csharp
// 构建流式 UI 体验
// dotnet add package Microsoft.Agents.AI.Hosting.AGUI.AspNetCore

app.MapAGUI("/chat/ag-ui", chatAgent);

// 在前端使用 AG-UI 客户端
// 支持流式响应、前端工具调用、共享状态管理
```

## Model Context Protocol (MCP)

扩展 AI 代理能力的标准化协议。

### 创建 MCP Server

```csharp
// 使用模板创建
// dotnet new install Microsoft.Extensions.AI.Templates
// dotnet new mcpserver -n MyMcpServer

// Tools/DatabaseTools.cs
[McpServerToolType]
public class DatabaseTools
{
    private readonly IDbConnection _db;

    public DatabaseTools(IDbConnection db)
    {
        _db = db;
    }

    [McpServerTool("query_database")]
    [Description("执行只读 SQL 查询")]
    public async Task<string> QueryDatabase(
        [Description("SQL 查询语句")] string sql)
    {
        // 验证查询是否为只读
        if (!IsReadOnlyQuery(sql))
            throw new InvalidOperationException("Only SELECT queries allowed");

        var results = await _db.QueryAsync(sql);
        return JsonSerializer.Serialize(results);
    }
}

// Resources/ConfigResource.cs
[McpServerResourceType]
public class ConfigResource
{
    [McpServerResource("config://app-settings")]
    [Description("应用配置信息")]
    public AppSettings GetAppSettings()
    {
        return _configuration.Get<AppSettings>()!;
    }
}

// Program.cs
var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddMcpServer()
    .AddTools<DatabaseTools>()
    .AddResources<ConfigResource>();

var host = builder.Build();
await host.RunAsync();
```

### 使用 MCP Server

```csharp
// 在代理中使用 MCP
var mcpClient = new McpClient();
await mcpClient.ConnectAsync("npx", ["-y", "@my-org/my-mcp-server"]);

var tools = await mcpClient.ListToolsAsync();
var agent = new ChatClientAgent(
    chatClient,
    new ChatClientAgentOptions
    {
        Name = "DataAnalyst",
        Tools = tools.Select(t => t.ToAIFunction()).ToArray()
    });
```

### 发布到 NuGet

```xml
<!-- 项目文件配置 -->
<PropertyGroup>
    <PackAsTool>true</PackAsTool>
    <ToolCommandName>my-mcp-server</ToolCommandName>
</PropertyGroup>
```

```bash
# 发布
dotnet pack
dotnet nuget push ./nupkg/*.nupkg -s https://api.nuget.org/v3/index.json

# 使用
dotnet tool install -g my-mcp-server
```

## RAG (检索增强生成) 模式

```csharp
public class RagService(
    IChatClient chatClient,
    IEmbeddingGenerator<string, Embedding<float>> embeddings,
    IVectorStore vectorStore)
{
    public async Task<string> AnswerWithContextAsync(string question)
    {
        // 1. 生成问题嵌入
        var questionEmbedding = await embeddings.GenerateEmbeddingAsync(question);

        // 2. 检索相关文档
        var relevantDocs = await vectorStore.SearchAsync(
            questionEmbedding.Vector,
            topK: 5,
            filter: new { category = "documentation" });

        // 3. 构建上下文
        var context = string.Join("\n\n", relevantDocs.Select(d => d.Content));

        // 4. 生成回答
        var prompt = $"""
            Based on the following context, answer the question.

            Context:
            {context}

            Question: {question}

            Answer:
            """;

        var response = await chatClient.CompleteAsync(prompt);
        return response.Message.Text ?? "";
    }
}
```

## 最佳实践

### 提示工程

```csharp
// 使用系统消息设置角色
var messages = new List<ChatMessage>
{
    new(ChatRole.System, """
        你是一个 .NET 技术专家。
        - 回答要准确、简洁
        - 提供代码示例时使用最新的 C# 语法
        - 如果不确定，诚实说明
        """),
    new(ChatRole.User, userQuestion)
};

// 使用 Few-shot 示例
var systemPrompt = """
    将用户的自然语言转换为 SQL 查询。

    示例:
    用户: 查找所有活跃用户
    SQL: SELECT * FROM Users WHERE IsActive = 1

    用户: 统计每个类别的产品数量
    SQL: SELECT Category, COUNT(*) as Count FROM Products GROUP BY Category
    """;
```

### 错误处理和重试

```csharp
// 使用 Polly 处理瞬态故障
builder.Services.AddChatClient(sp =>
{
    var client = CreateClient();

    return new ChatClientBuilder(client)
        .Use(async (messages, options, next, ct) =>
        {
            try
            {
                return await next(messages, options, ct);
            }
            catch (RateLimitException ex)
            {
                // 等待并重试
                await Task.Delay(ex.RetryAfter ?? TimeSpan.FromSeconds(60), ct);
                return await next(messages, options, ct);
            }
        })
        .Build();
});
```

### 成本控制

```csharp
// 监控 token 使用
public class TokenTrackingMiddleware : DelegatingChatClient
{
    private readonly ILogger _logger;

    public override async Task<ChatCompletion> CompleteAsync(
        IList<ChatMessage> chatMessages,
        ChatOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var response = await base.CompleteAsync(chatMessages, options, cancellationToken);

        _logger.LogInformation(
            "Tokens used - Input: {InputTokens}, Output: {OutputTokens}",
            response.Usage?.InputTokenCount,
            response.Usage?.OutputTokenCount);

        return response;
    }
}
```

## 常用 NuGet 包

| 包名                              | 用途                     |
| --------------------------------- | ------------------------ |
| `Microsoft.Extensions.AI`         | AI 统一抽象              |
| `Microsoft.Extensions.AI.OpenAI`  | OpenAI/Azure OpenAI 支持 |
| `Microsoft.Extensions.AI.Ollama`  | Ollama 本地模型支持      |
| `Microsoft.Extensions.VectorData` | 向量数据抽象             |
| `Microsoft.Agents.AI`             | Agent Framework          |
| `ModelContextProtocol`            | MCP SDK                  |
| `Semantic.Kernel`                 | Semantic Kernel          |
