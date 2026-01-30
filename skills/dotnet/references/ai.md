# .NET AI Development Best Practices

## Microsoft.Extensions.AI

### 配置

```csharp
// Azure OpenAI
builder.Services.AddChatClient(sp => new AzureOpenAIClient(
    new Uri(config["AzureOpenAI:Endpoint"]!),
    new AzureKeyCredential(config["AzureOpenAI:Key"]!)).AsChatClient("gpt-4o"));

// Ollama 本地
builder.Services.AddChatClient(sp => new OllamaChatClient(new Uri("http://localhost:11434"), "llama3.2"));
```

### 基础使用

```csharp
public class ChatService(IChatClient chatClient)
{
    // 简单对话
    public async Task<string> GetResponseAsync(string message)
    {
        var response = await chatClient.CompleteAsync(message);
        return response.Message.Text ?? "";
    }

    // 流式响应
    public async IAsyncEnumerable<string> StreamAsync(string message, [EnumeratorCancellation] CancellationToken ct = default)
    {
        await foreach (var chunk in chatClient.CompleteStreamingAsync(message, cancellationToken: ct))
            if (chunk.Text is not null) yield return chunk.Text;
    }

    // 带选项
    public async Task<string> GetStructuredAsync(string message)
    {
        var options = new ChatOptions { Temperature = 0.7f, MaxOutputTokens = 1000, ResponseFormat = ChatResponseFormat.Json };
        return (await chatClient.CompleteAsync(message, options)).Message.Text ?? "";
    }
}
```

### 中间件管道

```csharp
builder.Services.AddChatClient(services => innerClient
    .AsBuilder()
    .UseDistributedCache()
    .UseRateLimiting()
    .UseOpenTelemetry()
    .Build(services));
```

### 嵌入向量

```csharp
builder.Services.AddSingleton<IEmbeddingGenerator<string, Embedding<float>>>(sp =>
    new AzureOpenAIClient(endpoint, credential).AsEmbeddingGenerator("text-embedding-3-small"));

var embedding = await embeddings.GenerateEmbeddingAsync(doc.Content);
```

## Microsoft Agent Framework

### 创建代理

```csharp
AIAgent writer = new ChatClientAgent(chatClient, new ChatClientAgentOptions
{
    Name = "Writer",
    Instructions = "你是一个专业的技术文档撰写者。"
});

AIAgent reviewer = new ChatClientAgent(chatClient, new ChatClientAgentOptions
{
    Name = "Reviewer",
    Instructions = "你是一个严格的文档审核者。"
});
```

### 工作流

```csharp
// 顺序
var workflow = AgentWorkflowBuilder.BuildSequential(writer, reviewer);

// 并行
var workflow = AgentWorkflowBuilder.BuildConcurrent(researcher1, researcher2);

// 交接
var workflow = AgentWorkflowBuilder.BuildHandoff(router, new Dictionary<string, AIAgent>
{
    ["technical"] = technicalWriter,
    ["marketing"] = marketingWriter
});

var result = await (await workflow.AsAgentAsync()).InvokeAsync("写一篇 .NET 10 文章");
```

### 工具集成

```csharp
[Description("搜索知识库")]
public async Task<string> SearchKnowledgeBase([Description("搜索查询")] string query, int topK = 5)
{
    return JsonSerializer.Serialize(await _searchService.SearchAsync(query, topK));
}

var agent = new ChatClientAgent(chatClient, new ChatClientAgentOptions
{
    Name = "Assistant",
    Tools = [AIFunctionFactory.Create(SearchKnowledgeBase)]
});
```

### ASP.NET Core 集成

```csharp
builder.Services.AddAgentFramework().AddAgent<WriterAgent>().AddWorkflow<DocumentWorkflow>();
app.MapAgentEndpoint("/agents/writer", "WriterAgent");
app.MapAGUI("/chat/ag-ui", chatAgent); // AG-UI 协议
```

## Model Context Protocol (MCP)

### 创建 MCP Server

```csharp
// dotnet new install Microsoft.Extensions.AI.Templates
// dotnet new mcpserver -n MyMcpServer

builder.Services.AddMcpServer()
    .AddTool<SearchTool>()
    .AddResource<DocumentResource>();
```

### 作为 MCP Client

```csharp
var mcpClient = new McpClient(new Uri("http://localhost:3000"));
var tools = await mcpClient.ListToolsAsync();
var result = await mcpClient.CallToolAsync("search", new { query = "test" });
```

## RAG 模式

```csharp
public class RagService(IChatClient chat, IEmbeddingGenerator<string, Embedding<float>> embed, IVectorStore store)
{
    public async Task<string> QueryAsync(string question)
    {
        // 1. 嵌入问题
        var queryVector = await embed.GenerateEmbeddingAsync(question);

        // 2. 向量搜索
        var docs = await store.SearchAsync(queryVector.Vector, topK: 5);

        // 3. 构建提示
        var context = string.Join("\n", docs.Select(d => d.Content));
        var prompt = $"根据以下上下文回答问题：\n{context}\n\n问题：{question}";

        // 4. 生成回答
        return (await chat.CompleteAsync(prompt)).Message.Text ?? "";
    }
}
```
