# Blazor Best Practices

## 组件结构

```razor
@namespace MyApp.Components

<div class="user-card @CssClass" @attributes="AdditionalAttributes">
    <h3>@User.Name</h3>
    @if (ShowActions) { <div class="actions">@ChildContent</div> }
</div>

@code {
    [Parameter, EditorRequired] public UserDto User { get; set; } = default!;
    [Parameter] public bool ShowActions { get; set; } = true;
    [Parameter] public string? CssClass { get; set; }
    [Parameter] public RenderFragment? ChildContent { get; set; }
    [Parameter(CaptureUnmatchedValues = true)] public Dictionary<string, object>? AdditionalAttributes { get; set; }
}
```

## 生命周期

```razor
@code {
    [Parameter] public int UserId { get; set; }
    private UserDto? _user;

    protected override async Task OnInitializedAsync() => await LoadAsync();

    protected override async Task OnParametersSetAsync()
    {
        if (_user?.Id != UserId) await LoadAsync();
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender) await JS.InvokeVoidAsync("initComponent");
    }
}
```

## 状态管理

### EventCallback

```razor
<ChildComponent Data="@_data" OnDataChanged="HandleChanged" />

@code {
    [Parameter] public EventCallback<string> OnDataChanged { get; set; }
    private async Task NotifyParent() => await OnDataChanged.InvokeAsync("value");
}
```

### 级联参数

```razor
<CascadingValue Value="@_theme" Name="AppTheme">@ChildContent</CascadingValue>

@code {
    [CascadingParameter(Name = "AppTheme")] public Theme? Theme { get; set; }
}
```

### 状态容器

```csharp
public class AppState
{
    public User? CurrentUser { get => _user; set { _user = value; OnChange?.Invoke(); } }
    public event Action? OnChange;
}
builder.Services.AddScoped<AppState>();
```

```razor
@inject AppState AppState
@implements IDisposable

@code {
    protected override void OnInitialized() => AppState.OnChange += StateHasChanged;
    public void Dispose() => AppState.OnChange -= StateHasChanged;
}
```

## 表单

```razor
<EditForm Model="@_model" OnValidSubmit="HandleSubmit" FormName="UserForm">
    <DataAnnotationsValidator />
    <ValidationSummary />

    <InputText @bind-Value="_model.Name" />
    <ValidationMessage For="@(() => _model.Name)" />

    <button type="submit" disabled="@_submitting">Submit</button>
</EditForm>

@code {
    [SupplyParameterFromForm] private UserModel _model { get; set; } = new();
    private bool _submitting;

    private async Task HandleSubmit()
    {
        _submitting = true;
        try { await UserService.CreateAsync(_model); NavigationManager.NavigateTo("/users"); }
        finally { _submitting = false; }
    }
}
```

## JS Interop

```razor
@inject IJSRuntime JS

@code {
    private ElementReference _element;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            await JS.InvokeVoidAsync("initChart", _element);
        }
    }

    public async ValueTask DisposeAsync()
    {
        await JS.InvokeVoidAsync("destroyChart", _element);
    }
}
```

## 渲染模式 (Blazor 10)

```razor
@* Server 模式 *@
@rendermode InteractiveServer

@* WebAssembly 模式 *@
@rendermode InteractiveWebAssembly

@* 自动模式 *@
@rendermode InteractiveAuto

@* 流式渲染 *@
@attribute [StreamRendering]
```

## Blazor 10 新特性

### 声明式状态持久化

```razor
@code {
    [PersistentState] private UserData _userData = new();  // 自动在预渲染时持久化
}
```

### NotFound 处理

```razor
<Router NotFoundPage="typeof(Pages.NotFound)">
    <Found Context="routeData"><RouteView RouteData="@routeData" /></Found>
</Router>

@code {
    // 代码中触发 404
    NavigationManager.NotFound();
}
```

## 性能优化

```razor
@* 避免不必要的渲染 *@
@code {
    protected override bool ShouldRender() => _dataChanged;
}

@* 虚拟化大列表 *@
<Virtualize Items="@_items" Context="item">
    <ItemContent><div>@item.Name</div></ItemContent>
</Virtualize>
```
