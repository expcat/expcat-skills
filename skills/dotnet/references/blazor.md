# Blazor Best Practices

## 项目结构

```
src/
├── MyApp.Client/              # Blazor WebAssembly / 客户端组件
│   ├── Components/
│   │   ├── Layout/
│   │   ├── Pages/
│   │   └── Shared/
│   ├── Services/
│   └── wwwroot/
├── MyApp.Server/              # ASP.NET Core 主机
│   └── Controllers/
└── MyApp.Shared/              # 共享模型和接口
    ├── Models/
    └── Contracts/
```

## 组件设计

### 基础组件结构

```razor
@* UserCard.razor *@
@namespace MyApp.Components

<div class="user-card @CssClass" @attributes="AdditionalAttributes">
    <img src="@User.AvatarUrl" alt="@User.Name" />
    <div class="user-info">
        <h3>@User.Name</h3>
        <p>@User.Email</p>
    </div>
    @if (ShowActions)
    {
        <div class="actions">
            @ChildContent
        </div>
    }
</div>

@code {
    [Parameter, EditorRequired]
    public UserDto User { get; set; } = default!;

    [Parameter]
    public bool ShowActions { get; set; } = true;

    [Parameter]
    public string? CssClass { get; set; }

    [Parameter]
    public RenderFragment? ChildContent { get; set; }

    [Parameter(CaptureUnmatchedValues = true)]
    public Dictionary<string, object>? AdditionalAttributes { get; set; }
}
```

### 组件生命周期

```razor
@code {
    [Parameter]
    public int UserId { get; set; }

    private UserDto? _user;
    private bool _isLoading = true;

    // 组件初始化（仅执行一次）
    protected override async Task OnInitializedAsync()
    {
        await LoadUserAsync();
    }

    // 参数变化时触发
    protected override async Task OnParametersSetAsync()
    {
        // 检查参数是否实际变化
        if (_user?.Id != UserId)
        {
            await LoadUserAsync();
        }
    }

    // DOM 渲染后触发
    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            // 初次渲染后的 JS 互操作
            await JS.InvokeVoidAsync("initializeComponent");
        }
    }

    private async Task LoadUserAsync()
    {
        _isLoading = true;
        try
        {
            _user = await UserService.GetUserAsync(UserId);
        }
        finally
        {
            _isLoading = false;
        }
    }

    // 资源清理
    public void Dispose()
    {
        // 取消订阅、释放资源
    }
}
```

## 状态管理

### 组件间通信

```razor
@* 父组件 -> 子组件：参数传递 *@
<ChildComponent Data="@_data" OnDataChanged="HandleDataChanged" />

@* 子组件 -> 父组件：EventCallback *@
@code {
    [Parameter]
    public EventCallback<string> OnDataChanged { get; set; }

    private async Task NotifyParent()
    {
        await OnDataChanged.InvokeAsync("new value");
    }
}
```

### 级联参数

```razor
@* 祖先组件 *@
<CascadingValue Value="@_theme" Name="AppTheme">
    <CascadingValue Value="@_currentUser" IsFixed="true">
        @ChildContent
    </CascadingValue>
</CascadingValue>

@* 后代组件 *@
@code {
    [CascadingParameter(Name = "AppTheme")]
    public Theme? Theme { get; set; }

    [CascadingParameter]
    public User? CurrentUser { get; set; }
}
```

### 状态容器服务

```csharp
// 状态服务
public class AppState
{
    private User? _currentUser;

    public User? CurrentUser
    {
        get => _currentUser;
        set
        {
            _currentUser = value;
            NotifyStateChanged();
        }
    }

    public event Action? OnChange;

    private void NotifyStateChanged() => OnChange?.Invoke();
}

// 注册为 Scoped（WebAssembly）或 Singleton（Server）
builder.Services.AddScoped<AppState>();
```

```razor
@inject AppState AppState
@implements IDisposable

<p>User: @AppState.CurrentUser?.Name</p>

@code {
    protected override void OnInitialized()
    {
        AppState.OnChange += StateHasChanged;
    }

    public void Dispose()
    {
        AppState.OnChange -= StateHasChanged;
    }
}
```

## 表单处理

```razor
<EditForm Model="@_model" OnValidSubmit="HandleValidSubmit" FormName="UserForm">
    <DataAnnotationsValidator />
    <ValidationSummary />

    <div class="form-group">
        <label for="name">Name</label>
        <InputText id="name" @bind-Value="_model.Name" class="form-control" />
        <ValidationMessage For="@(() => _model.Name)" />
    </div>

    <div class="form-group">
        <label for="email">Email</label>
        <InputText id="email" @bind-Value="_model.Email" type="email" class="form-control" />
        <ValidationMessage For="@(() => _model.Email)" />
    </div>

    <div class="form-group">
        <label for="role">Role</label>
        <InputSelect id="role" @bind-Value="_model.Role" class="form-control">
            <option value="">Select a role...</option>
            @foreach (var role in _roles)
            {
                <option value="@role">@role</option>
            }
        </InputSelect>
    </div>

    <button type="submit" class="btn btn-primary" disabled="@_isSubmitting">
        @if (_isSubmitting)
        {
            <span class="spinner-border spinner-border-sm"></span>
        }
        Submit
    </button>
</EditForm>

@code {
    [SupplyParameterFromForm]
    private UserModel _model { get; set; } = new();

    private bool _isSubmitting;
    private string[] _roles = ["Admin", "User", "Guest"];

    private async Task HandleValidSubmit()
    {
        _isSubmitting = true;
        try
        {
            await UserService.CreateUserAsync(_model);
            NavigationManager.NavigateTo("/users");
        }
        finally
        {
            _isSubmitting = false;
        }
    }
}
```

### 自定义验证

```csharp
// 使用 FluentValidation
public class UserModelValidator : AbstractValidator<UserModel>
{
    public UserModelValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(100);

        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress();
    }
}

// 自定义 Validator 组件
@using FluentValidation
@typeparam TModel

@code {
    [CascadingParameter]
    private EditContext? EditContext { get; set; }

    [Inject]
    private IValidator<TModel>? Validator { get; set; }

    protected override void OnInitialized()
    {
        if (EditContext is null || Validator is null) return;

        var messages = new ValidationMessageStore(EditContext);

        EditContext.OnValidationRequested += async (s, e) =>
        {
            messages.Clear();
            var model = (TModel)EditContext.Model;
            var result = await Validator.ValidateAsync(model);

            foreach (var error in result.Errors)
            {
                var fieldIdentifier = new FieldIdentifier(model!, error.PropertyName);
                messages.Add(fieldIdentifier, error.ErrorMessage);
            }

            EditContext.NotifyValidationStateChanged();
        };
    }
}
```

## JavaScript 互操作

```csharp
// 调用 JS 函数
public class JsInteropService
{
    private readonly IJSRuntime _js;

    public JsInteropService(IJSRuntime js)
    {
        _js = js;
    }

    // 调用全局函数
    public async Task ShowAlertAsync(string message)
    {
        await _js.InvokeVoidAsync("alert", message);
    }

    // 调用并获取返回值
    public async Task<string> GetLocalStorageItemAsync(string key)
    {
        return await _js.InvokeAsync<string>("localStorage.getItem", key);
    }

    // 调用模块中的函数
    private IJSObjectReference? _module;

    public async Task InitializeAsync()
    {
        _module = await _js.InvokeAsync<IJSObjectReference>(
            "import", "./js/myModule.js");
    }

    public async Task<string> CallModuleFunctionAsync(string input)
    {
        return await _module!.InvokeAsync<string>("processData", input);
    }
}
```

```javascript
// wwwroot/js/myModule.js
export function processData(input) {
  return input.toUpperCase();
}

// 从 JS 调用 .NET 方法
window.callDotNet = async function () {
  await DotNet.invokeMethodAsync('MyApp', 'MyStaticMethod', 'argument');
};
```

```razor
@* 供 JS 调用的 .NET 方法 *@
@code {
    [JSInvokable]
    public static Task<string> MyStaticMethod(string input)
    {
        return Task.FromResult($"Received: {input}");
    }

    // 实例方法调用
    private DotNetObjectReference<MyComponent>? _objRef;

    protected override void OnInitialized()
    {
        _objRef = DotNetObjectReference.Create(this);
    }

    [JSInvokable]
    public void InstanceMethod(string data)
    {
        // 处理数据
        StateHasChanged();
    }

    public void Dispose()
    {
        _objRef?.Dispose();
    }
}
```

## 性能优化

### 虚拟化

```razor
@* 大列表虚拟化 *@
<Virtualize Items="@_largeList" Context="item" OverscanCount="10">
    <ItemContent>
        <div class="list-item">@item.Name</div>
    </ItemContent>
    <Placeholder>
        <div class="placeholder">Loading...</div>
    </Placeholder>
</Virtualize>

@* 使用 ItemsProvider 进行服务端分页 *@
<Virtualize ItemsProvider="LoadItems" Context="item">
    <div>@item.Name</div>
</Virtualize>

@code {
    private async ValueTask<ItemsProviderResult<ItemDto>> LoadItems(
        ItemsProviderRequest request)
    {
        var items = await ItemService.GetItemsAsync(
            request.StartIndex,
            request.Count,
            request.CancellationToken);

        return new ItemsProviderResult<ItemDto>(items.Data, items.TotalCount);
    }
}
```

### 避免不必要的渲染

```razor
@* 使用 @key 优化列表渲染 *@
@foreach (var item in _items)
{
    <ItemComponent @key="item.Id" Item="@item" />
}

@* 实现 ShouldRender 控制渲染 *@
@code {
    private bool _shouldRender = true;

    protected override bool ShouldRender() => _shouldRender;

    private void PreventRender()
    {
        _shouldRender = false;
    }

    private void AllowRender()
    {
        _shouldRender = true;
        StateHasChanged();
    }
}
```

### 流式渲染

```razor
@page "/streaming"
@attribute [StreamRendering]

@if (_data is null)
{
    <p>Loading...</p>
}
else
{
    <ul>
        @foreach (var item in _data)
        {
            <li>@item</li>
        }
    </ul>
}

@code {
    private List<string>? _data;

    protected override async Task OnInitializedAsync()
    {
        // 页面会先渲染 Loading，数据加载完成后自动更新
        _data = await SlowDataService.GetDataAsync();
    }
}
```

## 错误处理

```razor
@* ErrorBoundary 组件 *@
<ErrorBoundary @ref="_errorBoundary">
    <ChildContent>
        <RiskyComponent />
    </ChildContent>
    <ErrorContent Context="ex">
        <div class="alert alert-danger">
            <h4>An error occurred</h4>
            <p>@ex.Message</p>
            <button @onclick="Recover">Try Again</button>
        </div>
    </ErrorContent>
</ErrorBoundary>

@code {
    private ErrorBoundary? _errorBoundary;

    private void Recover()
    {
        _errorBoundary?.Recover();
    }
}
```

## 身份认证

```razor
@* AuthorizeView 组件 *@
<AuthorizeView>
    <Authorized>
        <p>Hello, @context.User.Identity?.Name!</p>
        <a href="logout">Logout</a>
    </Authorized>
    <NotAuthorized>
        <p>Please <a href="login">log in</a>.</p>
    </NotAuthorized>
    <Authorizing>
        <p>Checking authentication...</p>
    </Authorizing>
</AuthorizeView>

@* 基于角色/策略 *@
<AuthorizeView Roles="Admin">
    <p>Admin only content</p>
</AuthorizeView>

<AuthorizeView Policy="CanEditUsers">
    <button>Edit User</button>
</AuthorizeView>
```

```razor
@* 页面级授权 *@
@page "/admin"
@attribute [Authorize(Roles = "Admin")]

@code {
    [CascadingParameter]
    private Task<AuthenticationState>? AuthStateTask { get; set; }

    protected override async Task OnInitializedAsync()
    {
        var authState = await AuthStateTask!;
        var user = authState.User;

        if (user.Identity?.IsAuthenticated == true)
        {
            var userId = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        }
    }
}
```

## 渲染模式

```razor
@* 静态服务端渲染 *@
@rendermode @(new InteractiveServerRenderMode(prerender: false))

@* 交互式服务端渲染 *@
@rendermode InteractiveServer

@* WebAssembly 渲染 *@
@rendermode InteractiveWebAssembly

@* 自动选择（先 Server 后 WASM）*@
@rendermode InteractiveAuto

@* 在组件级别指定 *@
<Counter @rendermode="InteractiveServer" />
```

## 常用第三方库

- `MudBlazor` - Material Design 组件库
- `Radzen.Blazor` - 丰富的 UI 组件
- `Blazored.LocalStorage` - 本地存储
- `Blazored.Modal` - 模态框
- `Fluxor` - Redux 风格状态管理
- `bUnit` - Blazor 组件测试

## Blazor 10 新特性

### 声明式状态持久化

```razor
@* 使用 [PersistentState] 属性声明式持久化状态 *@
@inject PersistentComponentState PersistentState

@code {
    // 预渲染期间自动持久化状态
    [PersistentState]
    private UserData? userData;

    [PersistentState("cart")]
    private List<CartItem> cartItems = [];

    protected override async Task OnInitializedAsync()
    {
        // 状态会在预渲染和交互式渲染之间自动恢复
        userData ??= await LoadUserDataAsync();
    }
}
```

### 电路状态持久化与暂停/恢复

```csharp
// Blazor Server 电路在长时间断开后自动持久化状态
// 用户重新连接时恢复工作状态，不丢失数据

// Program.cs - 配置电路选项
builder.Services.AddServerSideBlazor(options =>
{
    options.DisconnectedCircuitRetentionPeriod = TimeSpan.FromMinutes(10);
    options.CircuitInactivityTimeout = TimeSpan.FromMinutes(5);
});

// 暂停和恢复电路 API - 提升服务器可扩展性
builder.Services.AddServerSideBlazor()
    .AddCircuitOptions(options =>
    {
        options.EnableCircuitPauseAndResume = true;
    });
```

### WebAssembly 预加载

```csharp
// Blazor Web Apps 自动预加载框架资源
// 使用 Link headers 提高初始加载性能

// 独立 WebAssembly 应用也受益于高优先级资源下载
// 无需额外配置，默认启用
```

### HttpClient 响应流式处理

```razor
@* HttpClient 响应默认启用流式处理 *@
@inject HttpClient Http

@code {
    private async Task ProcessLargeFileAsync()
    {
        // 默认流式处理，减少内存占用
        using var response = await Http.GetAsync("/large-file",
            HttpCompletionOption.ResponseHeadersRead);

        await using var stream = await response.Content.ReadAsStreamAsync();
        // 流式处理大型响应
    }
}
```

### 改进的表单验证

```razor
@* 支持嵌套对象和集合的自动验证 *@
<EditForm Model="@order" OnValidSubmit="Submit">
    <DataAnnotationsValidator />
    <ValidationSummary />

    @* 嵌套对象验证 *@
    <InputText @bind-Value="order.Customer.Name" />
    <ValidationMessage For="@(() => order.Customer.Name)" />

    @* 集合项验证 *@
    @foreach (var item in order.Items)
    {
        <InputNumber @bind-Value="item.Quantity" />
        <ValidationMessage For="@(() => item.Quantity)" />
    }

    <button type="submit">Submit</button>
</EditForm>

@code {
    private OrderModel order = new();

    public class OrderModel
    {
        [ValidateComplexType] // 验证嵌套对象
        public CustomerInfo Customer { get; set; } = new();

        [ValidateEnumerable] // 验证集合中的每个项
        public List<OrderItem> Items { get; set; } = [];
    }
}
```

### NotFoundPage 路由处理

```razor
@* Router 组件支持 NotFoundPage 参数 *@
<Router AppAssembly="@typeof(App).Assembly"
        NotFoundPage="@typeof(NotFoundPage)">
    <Found Context="routeData">
        <RouteView RouteData="@routeData" DefaultLayout="@typeof(MainLayout)" />
    </Found>
</Router>

@* NotFoundPage.razor *@
@page "/not-found"

<h1>404 - Page Not Found</h1>
<p>The page you requested does not exist.</p>
<a href="/">Return to Home</a>
```

```csharp
// 在代码中触发 404
@inject NavigationManager Navigation

@code {
    private async Task LoadDataAsync()
    {
        var item = await GetItemAsync(id);
        if (item is null)
        {
            Navigation.NotFound(); // 触发 NotFound 响应
            return;
        }
    }
}
```

### QuickGrid 增强

```razor
@* RowClass 参数支持 *@
<QuickGrid Items="@users" RowClass="@GetRowClass">
    <PropertyColumn Property="@(u => u.Name)" />
    <PropertyColumn Property="@(u => u.Status)" />
</QuickGrid>

@code {
    private string GetRowClass(User user) => user.Status switch
    {
        "Active" => "row-active",
        "Inactive" => "row-inactive",
        "Pending" => "row-pending",
        _ => ""
    };
}
```

### JavaScript 互操作增强

```razor
@inject IJSRuntime JS

@code {
    private IJSObjectReference? jsModule;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            jsModule = await JS.InvokeAsync<IJSObjectReference>(
                "import", "./js/myModule.js");

            // 创建 JS 对象实例
            var jsObject = await jsModule.InvokeAsync<IJSObjectReference>(
                "createInstance", "MyClass", arg1, arg2);

            // 直接读取/写入 JS 对象属性
            var value = await jsObject.GetPropertyAsync<string>("propertyName");
            await jsObject.SetPropertyAsync("propertyName", "newValue");

            // 同步版本 (Blazor WebAssembly)
            var syncValue = jsObject.GetProperty<int>("count");
            jsObject.SetProperty("count", syncValue + 1);
        }
    }
}
```
