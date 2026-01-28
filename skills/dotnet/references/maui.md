# .NET MAUI Best Practices

## 项目结构

```
src/
├── MyApp.Maui/                    # MAUI 应用项目
│   ├── Platforms/                 # 平台特定代码
│   │   ├── Android/
│   │   ├── iOS/
│   │   ├── MacCatalyst/
│   │   └── Windows/
│   ├── Resources/                 # 资源文件
│   │   ├── Fonts/
│   │   ├── Images/
│   │   ├── Raw/
│   │   └── Styles/
│   ├── Views/                     # 页面和视图
│   ├── ViewModels/                # 视图模型
│   ├── Models/                    # 数据模型
│   ├── Services/                  # 服务层
│   └── Converters/                # 值转换器
├── MyApp.Core/                    # 共享业务逻辑
└── MyApp.Tests/                   # 测试项目
```

## MVVM 模式

### ViewModel 基类

```csharp
// 使用 CommunityToolkit.Mvvm
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

public partial class BaseViewModel : ObservableObject
{
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsNotBusy))]
    private bool _isBusy;

    [ObservableProperty]
    private string? _title;

    public bool IsNotBusy => !IsBusy;

    protected async Task ExecuteAsync(Func<Task> operation, Action<Exception>? onError = null)
    {
        if (IsBusy) return;

        try
        {
            IsBusy = true;
            await operation();
        }
        catch (Exception ex)
        {
            onError?.Invoke(ex);
            await Shell.Current.DisplayAlert("Error", ex.Message, "OK");
        }
        finally
        {
            IsBusy = false;
        }
    }
}
```

### ViewModel 示例

```csharp
public partial class UsersViewModel : BaseViewModel
{
    private readonly IUserService _userService;

    [ObservableProperty]
    private ObservableCollection<User> _users = new();

    [ObservableProperty]
    private User? _selectedUser;

    public UsersViewModel(IUserService userService)
    {
        _userService = userService;
        Title = "Users";
    }

    [RelayCommand]
    private async Task LoadUsersAsync()
    {
        await ExecuteAsync(async () =>
        {
            var users = await _userService.GetUsersAsync();
            Users = new ObservableCollection<User>(users);
        });
    }

    [RelayCommand]
    private async Task GoToDetailsAsync(User user)
    {
        await Shell.Current.GoToAsync($"{nameof(UserDetailPage)}", new Dictionary<string, object>
        {
            ["User"] = user
        });
    }

    [RelayCommand]
    private async Task DeleteUserAsync(User user)
    {
        bool confirm = await Shell.Current.DisplayAlert(
            "Confirm",
            $"Delete {user.Name}?",
            "Yes", "No");

        if (confirm)
        {
            await _userService.DeleteUserAsync(user.Id);
            Users.Remove(user);
        }
    }

    // 属性变化时自动调用
    partial void OnSelectedUserChanged(User? value)
    {
        if (value is not null)
        {
            // 处理选择变化
        }
    }
}
```

## XAML 页面

```xml
<?xml version="1.0" encoding="utf-8" ?>
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
             xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml"
             xmlns:vm="clr-namespace:MyApp.ViewModels"
             xmlns:models="clr-namespace:MyApp.Models"
             xmlns:toolkit="http://schemas.microsoft.com/dotnet/2022/maui/toolkit"
             x:Class="MyApp.Views.UsersPage"
             x:DataType="vm:UsersViewModel"
             Title="{Binding Title}">

    <ContentPage.Behaviors>
        <toolkit:EventToCommandBehavior
            EventName="Appearing"
            Command="{Binding LoadUsersCommand}" />
    </ContentPage.Behaviors>

    <RefreshView IsRefreshing="{Binding IsBusy}"
                 Command="{Binding LoadUsersCommand}">
        <CollectionView ItemsSource="{Binding Users}"
                        SelectionMode="Single"
                        SelectedItem="{Binding SelectedUser}"
                        EmptyView="No users found">

            <CollectionView.ItemTemplate>
                <DataTemplate x:DataType="models:User">
                    <SwipeView>
                        <SwipeView.RightItems>
                            <SwipeItems>
                                <SwipeItem Text="Delete"
                                           BackgroundColor="Red"
                                           Command="{Binding Source={RelativeSource AncestorType={x:Type vm:UsersViewModel}}, Path=DeleteUserCommand}"
                                           CommandParameter="{Binding}" />
                            </SwipeItems>
                        </SwipeView.RightItems>

                        <Frame Margin="10" Padding="10">
                            <Frame.GestureRecognizers>
                                <TapGestureRecognizer
                                    Command="{Binding Source={RelativeSource AncestorType={x:Type vm:UsersViewModel}}, Path=GoToDetailsCommand}"
                                    CommandParameter="{Binding}" />
                            </Frame.GestureRecognizers>

                            <HorizontalStackLayout Spacing="10">
                                <Image Source="{Binding AvatarUrl}"
                                       WidthRequest="50"
                                       HeightRequest="50">
                                    <Image.Clip>
                                        <EllipseGeometry RadiusX="25" RadiusY="25" Center="25,25"/>
                                    </Image.Clip>
                                </Image>

                                <VerticalStackLayout VerticalOptions="Center">
                                    <Label Text="{Binding Name}"
                                           FontSize="16"
                                           FontAttributes="Bold" />
                                    <Label Text="{Binding Email}"
                                           FontSize="12"
                                           TextColor="Gray" />
                                </VerticalStackLayout>
                            </HorizontalStackLayout>
                        </Frame>
                    </SwipeView>
                </DataTemplate>
            </CollectionView.ItemTemplate>
        </CollectionView>
    </RefreshView>

    <!-- 加载指示器 -->
    <ActivityIndicator IsRunning="{Binding IsBusy}"
                       IsVisible="{Binding IsBusy}"
                       HorizontalOptions="Center"
                       VerticalOptions="Center" />
</ContentPage>
```

## 依赖注入

```csharp
// MauiProgram.cs
public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .UseMauiCommunityToolkit()
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
            });

        // 注册服务
        builder.Services.AddSingleton<IUserService, UserService>();
        builder.Services.AddSingleton<IConnectivity>(Connectivity.Current);
        builder.Services.AddSingleton<IGeolocation>(Geolocation.Default);

        // 注册 HttpClient
        builder.Services.AddHttpClient<IApiClient, ApiClient>(client =>
        {
            client.BaseAddress = new Uri("https://api.example.com");
        });

        // 注册 ViewModel
        builder.Services.AddTransient<UsersViewModel>();
        builder.Services.AddTransient<UserDetailViewModel>();

        // 注册页面
        builder.Services.AddTransient<UsersPage>();
        builder.Services.AddTransient<UserDetailPage>();

#if DEBUG
        builder.Logging.AddDebug();
#endif

        return builder.Build();
    }
}
```

## Shell 导航

```xml
<!-- AppShell.xaml -->
<Shell xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
       xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml"
       xmlns:views="clr-namespace:MyApp.Views"
       x:Class="MyApp.AppShell">

    <FlyoutItem Title="Home" Icon="home.png">
        <ShellContent ContentTemplate="{DataTemplate views:HomePage}" />
    </FlyoutItem>

    <FlyoutItem Title="Users" Icon="users.png">
        <ShellContent ContentTemplate="{DataTemplate views:UsersPage}" />
    </FlyoutItem>

    <FlyoutItem Title="Settings" Icon="settings.png">
        <ShellContent ContentTemplate="{DataTemplate views:SettingsPage}" />
    </FlyoutItem>

    <!-- Tab 导航 -->
    <TabBar>
        <Tab Title="Browse" Icon="browse.png">
            <ShellContent ContentTemplate="{DataTemplate views:BrowsePage}" />
        </Tab>
        <Tab Title="Search" Icon="search.png">
            <ShellContent ContentTemplate="{DataTemplate views:SearchPage}" />
        </Tab>
    </TabBar>
</Shell>
```

```csharp
// AppShell.xaml.cs
public partial class AppShell : Shell
{
    public AppShell()
    {
        InitializeComponent();

        // 注册路由
        Routing.RegisterRoute(nameof(UserDetailPage), typeof(UserDetailPage));
        Routing.RegisterRoute(nameof(EditUserPage), typeof(EditUserPage));
    }
}

// 导航示例
// 简单导航
await Shell.Current.GoToAsync("//Users");

// 带参数导航
await Shell.Current.GoToAsync($"UserDetail?id={userId}");

// 传递复杂对象
await Shell.Current.GoToAsync("UserDetail", new Dictionary<string, object>
{
    ["User"] = selectedUser
});

// 返回
await Shell.Current.GoToAsync("..");

// 接收参数
[QueryProperty(nameof(UserId), "id")]
public partial class UserDetailViewModel : BaseViewModel
{
    [ObservableProperty]
    private int _userId;

    // 或使用属性
    [QueryProperty(nameof(User), "User")]
    private User? _user;
}
```

## 平台特定代码

```csharp
// 使用条件编译
#if ANDROID
    // Android 特定代码
#elif IOS
    // iOS 特定代码
#elif WINDOWS
    // Windows 特定代码
#endif

// 使用 DeviceInfo
if (DeviceInfo.Platform == DevicePlatform.Android)
{
    // Android 逻辑
}

// 使用部分类和部分方法
// Services/DeviceService.cs
public partial class DeviceService
{
    public partial string GetDeviceId();
}

// Platforms/Android/Services/DeviceService.cs
public partial class DeviceService
{
    public partial string GetDeviceId()
    {
        return Android.Provider.Settings.Secure.GetString(
            Android.App.Application.Context.ContentResolver,
            Android.Provider.Settings.Secure.AndroidId);
    }
}

// Platforms/iOS/Services/DeviceService.cs
public partial class DeviceService
{
    public partial string GetDeviceId()
    {
        return UIKit.UIDevice.CurrentDevice.IdentifierForVendor?.ToString() ?? "";
    }
}
```

## 本地存储

```csharp
// Preferences - 简单键值存储
Preferences.Set("username", "john");
var username = Preferences.Get("username", "default");
Preferences.Remove("username");
Preferences.Clear();

// SecureStorage - 安全存储敏感数据
await SecureStorage.SetAsync("auth_token", token);
var token = await SecureStorage.GetAsync("auth_token");
SecureStorage.Remove("auth_token");

// 文件存储
public class LocalDataService
{
    private readonly string _dataPath;

    public LocalDataService()
    {
        _dataPath = Path.Combine(FileSystem.AppDataDirectory, "data.json");
    }

    public async Task SaveDataAsync<T>(T data)
    {
        var json = JsonSerializer.Serialize(data);
        await File.WriteAllTextAsync(_dataPath, json);
    }

    public async Task<T?> LoadDataAsync<T>()
    {
        if (!File.Exists(_dataPath))
            return default;

        var json = await File.ReadAllTextAsync(_dataPath);
        return JsonSerializer.Deserialize<T>(json);
    }
}

// SQLite 数据库
builder.Services.AddSingleton<IDataService>(provider =>
{
    var dbPath = Path.Combine(FileSystem.AppDataDirectory, "app.db3");
    return new SqliteDataService(dbPath);
});
```

## 样式和主题

```xml
<!-- Resources/Styles/Styles.xaml -->
<ResourceDictionary xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
                    xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml">

    <!-- 颜色 -->
    <Color x:Key="PrimaryColor">#512BD4</Color>
    <Color x:Key="SecondaryColor">#DFD8F7</Color>

    <!-- 隐式样式 -->
    <Style TargetType="Button">
        <Setter Property="BackgroundColor" Value="{StaticResource PrimaryColor}" />
        <Setter Property="TextColor" Value="White" />
        <Setter Property="CornerRadius" Value="8" />
        <Setter Property="Padding" Value="16,8" />
        <Setter Property="VisualStateManager.VisualStateGroups">
            <VisualStateGroupList>
                <VisualStateGroup x:Name="CommonStates">
                    <VisualState x:Name="Normal" />
                    <VisualState x:Name="Disabled">
                        <VisualState.Setters>
                            <Setter Property="Opacity" Value="0.5" />
                        </VisualState.Setters>
                    </VisualState>
                </VisualStateGroup>
            </VisualStateGroupList>
        </Setter>
    </Style>

    <!-- 命名样式 -->
    <Style x:Key="HeaderLabel" TargetType="Label">
        <Setter Property="FontSize" Value="24" />
        <Setter Property="FontAttributes" Value="Bold" />
        <Setter Property="TextColor" Value="{AppThemeBinding Light=Black, Dark=White}" />
    </Style>

    <!-- 样式继承 -->
    <Style x:Key="SubHeaderLabel" TargetType="Label" BasedOn="{StaticResource HeaderLabel}">
        <Setter Property="FontSize" Value="18" />
    </Style>
</ResourceDictionary>
```

```csharp
// 动态切换主题
Application.Current!.UserAppTheme = AppTheme.Dark;

// 响应系统主题变化
Application.Current.RequestedThemeChanged += (s, e) =>
{
    var theme = e.RequestedTheme;
};
```

## 网络连接

```csharp
public class ConnectivityService
{
    private readonly IConnectivity _connectivity;

    public ConnectivityService(IConnectivity connectivity)
    {
        _connectivity = connectivity;
        _connectivity.ConnectivityChanged += OnConnectivityChanged;
    }

    public bool IsConnected => _connectivity.NetworkAccess == NetworkAccess.Internet;

    public bool IsWifi => _connectivity.ConnectionProfiles.Contains(ConnectionProfile.WiFi);

    private void OnConnectivityChanged(object? sender, ConnectivityChangedEventArgs e)
    {
        if (e.NetworkAccess == NetworkAccess.Internet)
        {
            // 恢复连接
        }
        else
        {
            // 离线模式
        }
    }
}

// 在 ViewModel 中使用
[RelayCommand]
private async Task RefreshDataAsync()
{
    if (!_connectivity.IsConnected)
    {
        await Shell.Current.DisplayAlert("No Internet", "Please check your connection.", "OK");
        return;
    }

    await LoadDataAsync();
}
```

## 推送通知

```csharp
// Android 配置 - Platforms/Android/MainActivity.cs
[Activity(LaunchMode = LaunchMode.SingleTop)]
public class MainActivity : MauiAppCompatActivity
{
    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        CreateNotificationChannel();
    }

    private void CreateNotificationChannel()
    {
        if (Build.VERSION.SdkInt >= BuildVersionCodes.O)
        {
            var channel = new NotificationChannel(
                "default",
                "Default",
                NotificationImportance.Default);

            var manager = (NotificationManager?)GetSystemService(NotificationService);
            manager?.CreateNotificationChannel(channel);
        }
    }
}

// 使用 Plugin.LocalNotification
public class NotificationService
{
    public async Task ShowNotificationAsync(string title, string message)
    {
        var request = new NotificationRequest
        {
            NotificationId = new Random().Next(),
            Title = title,
            Description = message,
            Schedule = new NotificationRequestSchedule
            {
                NotifyTime = DateTime.Now.AddSeconds(1)
            }
        };

        await LocalNotificationCenter.Current.Show(request);
    }
}
```

## 测试

```csharp
// ViewModel 单元测试
public class UsersViewModelTests
{
    private readonly Mock<IUserService> _mockUserService;
    private readonly UsersViewModel _viewModel;

    public UsersViewModelTests()
    {
        _mockUserService = new Mock<IUserService>();
        _viewModel = new UsersViewModel(_mockUserService.Object);
    }

    [Fact]
    public async Task LoadUsersCommand_WhenExecuted_PopulatesUsers()
    {
        // Arrange
        var users = new List<User>
        {
            new() { Id = 1, Name = "User 1" },
            new() { Id = 2, Name = "User 2" }
        };
        _mockUserService.Setup(x => x.GetUsersAsync())
            .ReturnsAsync(users);

        // Act
        await _viewModel.LoadUsersCommand.ExecuteAsync(null);

        // Assert
        Assert.Equal(2, _viewModel.Users.Count);
        Assert.False(_viewModel.IsBusy);
    }
}
```

## 常用 NuGet 包

- `CommunityToolkit.Mvvm` - MVVM 工具包
- `CommunityToolkit.Maui` - MAUI 社区工具包
- `sqlite-net-pcl` - SQLite 数据库
- `Plugin.LocalNotification` - 本地通知
- `Plugin.Fingerprint` - 生物识别认证
- `SkiaSharp.Views.Maui.Controls` - 2D 图形
- `Sharpnado.Tabs` - Tab 控件
- `Syncfusion.Maui.*` - 企业级控件库

## .NET MAUI 10 新特性

### 全局 XAML 命名空间

```csharp
// GlobalXmlns.cs - 全局声明命名空间
[assembly: XmlnsDefinition("http://schemas.microsoft.com/dotnet/2021/maui", "MyApp.Models")]
[assembly: XmlnsDefinition("http://schemas.microsoft.com/dotnet/2021/maui", "MyApp.Controls")]
[assembly: XmlnsDefinition("http://schemas.microsoft.com/dotnet/2021/maui", "MyApp.ViewModels")]

// 启用全局命名空间 (项目文件)
// <EnableDefaultMauiImplicitNamespaces>true</EnableDefaultMauiImplicitNamespaces>
```

```xml
<!-- 之前：需要声明每个命名空间 -->
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
             xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml"
             xmlns:models="clr-namespace:MyApp.Models"
             xmlns:controls="clr-namespace:MyApp.Controls"
             x:Class="MyApp.MainPage">
    <controls:TagView x:DataType="models:Tag" />
</ContentPage>

<!-- 之后：无需前缀 -->
<ContentPage x:Class="MyApp.MainPage">
    <TagView x:DataType="Tag" />
</ContentPage>
```

### 新 XAML 源代码生成器

```xml
<!-- 启用新的 XAML 源代码生成器 -->
<!-- 项目文件中: -->
<!-- <EnableNewXamlSourceGenerator>true</EnableNewXamlSourceGenerator> -->

<!-- 优势：
     - 更快的编译时 XAML 处理
     - 更好的 IntelliSense 支持
     - 编译时错误检测
     - 减少运行时 XAML 解析 -->
```

### MediaPicker 增强

```csharp
// 多文件选择
var result = await MediaPicker.PickMultipleAsync(new MediaPickerOptions
{
    Title = "Select Photos"
});

foreach (var file in result)
{
    using var stream = await file.OpenReadAsync();
    // 处理每个文件
}

// 图片压缩支持
var photo = await MediaPicker.CapturePhotoAsync(new MediaPickerOptions
{
    MaximumWidth = 1024,
    MaximumHeight = 768,
    CompressionQuality = 80 // 0-100
});

// 自动 EXIF 处理
var photoWithMetadata = await MediaPicker.PickPhotoAsync();
// EXIF 方向自动校正
```

### Web 请求拦截

```csharp
// BlazorWebView 和 HybridWebView 支持请求拦截
public partial class MainPage : ContentPage
{
    public MainPage()
    {
        InitializeComponent();

        blazorWebView.UrlLoading += OnUrlLoading;
        hybridWebView.WebResourceRequested += OnWebResourceRequested;
    }

    // 拦截 URL 加载
    private void OnUrlLoading(object? sender, UrlLoadingEventArgs e)
    {
        if (e.Url.Host == "external-link.com")
        {
            e.UrlLoadingStrategy = UrlLoadingStrategy.OpenExternally;
        }
    }

    // 拦截 Web 资源请求
    private void OnWebResourceRequested(object? sender,
        WebResourceRequestedEventArgs e)
    {
        // 修改请求头
        e.Request.Headers["Authorization"] = $"Bearer {_token}";

        // 重定向请求
        if (e.Request.Uri.Contains("/api/"))
        {
            e.Request.Uri = e.Request.Uri.Replace(
                "https://old-api.com",
                "https://new-api.com");
        }

        // 提供本地响应
        if (e.Request.Uri.EndsWith("/config.json"))
        {
            e.Response = new WebResourceResponse(
                "application/json",
                Encoding.UTF8,
                new MemoryStream(Encoding.UTF8.GetBytes(_localConfig)));
        }
    }
}
```

### HybridWebView 增强

```csharp
// 新的初始化事件
hybridWebView.WebViewInitializing += (s, e) =>
{
    // 平台特定自定义 (在 WebView 创建前)
#if ANDROID
    e.Configuration.AllowFileAccess = true;
#elif IOS
    e.Configuration.AllowsInlineMediaPlayback = true;
#endif
};

hybridWebView.WebViewInitialized += (s, e) =>
{
    // WebView 已创建，可以进行额外配置
#if ANDROID
    e.WebView.Settings.JavaScriptEnabled = true;
#endif
};

// InvokeJavaScriptAsync 重载
var result = await hybridWebView.InvokeJavaScriptAsync<MyResponseType>(
    "myJsFunction",
    new object[] { param1, param2 });

// JavaScript 异常处理
try
{
    await hybridWebView.InvokeJavaScriptAsync("throwingFunction");
}
catch (JavaScriptException ex)
{
    // 处理 JS 异常
    Console.WriteLine($"JS Error: {ex.Message}");
}
```

### SafeArea 增强

```xml
<!-- SafeAreaEdges API 支持多平台 -->
<ContentPage>
    <Grid SafeArea.Edges="All">
        <!-- 内容自动避开安全区域 -->
    </Grid>

    <!-- 选择性应用 -->
    <Grid SafeArea.Edges="Top,Bottom">
        <!-- 只避开顶部和底部安全区域 -->
    </Grid>
</ContentPage>
```

### 二级工具栏项 (iOS/macOS)

```xml
<!-- iOS 和 macOS 支持二级工具栏项 -->
<ContentPage.ToolbarItems>
    <ToolbarItem Text="Save" Command="{Binding SaveCommand}" />
    <ToolbarItem Text="More" Order="Secondary">
        <ToolbarItem.Menu>
            <MenuItem Text="Export" Command="{Binding ExportCommand}" />
            <MenuItem Text="Share" Command="{Binding ShareCommand}" />
            <MenuItem Text="Delete" Command="{Binding DeleteCommand}" />
        </ToolbarItem.Menu>
    </ToolbarItem>
</ContentPage.ToolbarItems>
```

### Aspire 集成

```csharp
// 新的 MAUI + Aspire 项目模板
// dotnet new maui-aspire -n MyApp

// MauiProgram.cs
public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .AddAppDefaults(); // 添加 Aspire 默认配置

        // 自动配置遥测和服务发现
        builder.Services.AddServiceDiscovery();
        builder.Services.AddOpenTelemetry()
            .WithTracing(tracing => tracing.AddSource("MyApp"))
            .WithMetrics(metrics => metrics.AddMeter("MyApp"));

        return builder.Build();
    }
}
```

### 诊断和性能监控

```csharp
// 布局性能监控
using System.Diagnostics;

// ActivitySource 用于追踪
private static readonly ActivitySource s_activitySource = new("MyApp.Layout");

public void OnLayoutUpdated()
{
    using var activity = s_activitySource.StartActivity("LayoutUpdate");
    activity?.SetTag("page", GetType().Name);
    // 布局逻辑
}

// 指标收集
using System.Diagnostics.Metrics;

private static readonly Meter s_meter = new("MyApp.Performance");
private static readonly Counter<long> s_layoutCounter =
    s_meter.CreateCounter<long>("layout_updates");

public void TrackLayout()
{
    s_layoutCounter.Add(1, new KeyValuePair<string, object?>("page", "MainPage"));
}
```
