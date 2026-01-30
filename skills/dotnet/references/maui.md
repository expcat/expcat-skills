# .NET MAUI Best Practices

## 项目结构

```
MyApp.Maui/
├── Platforms/        # 平台特定代码
├── Resources/        # 字体、图片、样式
├── Views/            # 页面
├── ViewModels/       # 视图模型
├── Models/           # 数据模型
└── Services/         # 服务层
```

## MVVM (CommunityToolkit.Mvvm)

### ViewModel 基类

```csharp
public partial class BaseViewModel : ObservableObject
{
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsNotBusy))]
    private bool _isBusy;

    public bool IsNotBusy => !IsBusy;

    protected async Task ExecuteAsync(Func<Task> operation)
    {
        if (IsBusy) return;
        try { IsBusy = true; await operation(); }
        catch (Exception ex) { await Shell.Current.DisplayAlert("Error", ex.Message, "OK"); }
        finally { IsBusy = false; }
    }
}
```

### ViewModel 示例

```csharp
public partial class UsersViewModel(IUserService userService) : BaseViewModel
{
    [ObservableProperty] private ObservableCollection<User> _users = [];
    [ObservableProperty] private User? _selectedUser;

    [RelayCommand]
    private async Task LoadUsersAsync() => await ExecuteAsync(async () =>
        Users = new(await userService.GetUsersAsync()));

    [RelayCommand]
    private async Task GoToDetailsAsync(User user) =>
        await Shell.Current.GoToAsync(nameof(UserDetailPage), new Dictionary<string, object> { ["User"] = user });

    partial void OnSelectedUserChanged(User? value) { /* 处理选择变化 */ }
}
```

## XAML 页面

```xml
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
             xmlns:vm="clr-namespace:MyApp.ViewModels"
             x:DataType="vm:UsersViewModel">
    <ContentPage.Behaviors>
        <toolkit:EventToCommandBehavior EventName="Appearing" Command="{Binding LoadUsersCommand}" />
    </ContentPage.Behaviors>

    <RefreshView IsRefreshing="{Binding IsBusy}" Command="{Binding LoadUsersCommand}">
        <CollectionView ItemsSource="{Binding Users}" SelectionMode="Single" SelectedItem="{Binding SelectedUser}">
            <CollectionView.ItemTemplate>
                <DataTemplate x:DataType="models:User">
                    <Frame Margin="10">
                        <Frame.GestureRecognizers>
                            <TapGestureRecognizer Command="{Binding Source={RelativeSource AncestorType={x:Type vm:UsersViewModel}}, Path=GoToDetailsCommand}" CommandParameter="{Binding}" />
                        </Frame.GestureRecognizers>
                        <Label Text="{Binding Name}" />
                    </Frame>
                </DataTemplate>
            </CollectionView.ItemTemplate>
        </CollectionView>
    </RefreshView>
</ContentPage>
```

## 依赖注入

```csharp
public static MauiApp CreateMauiApp()
{
    var builder = MauiApp.CreateBuilder();
    builder.UseMauiApp<App>().UseMauiCommunityToolkit();

    // 服务
    builder.Services.AddSingleton<IUserService, UserService>();
    builder.Services.AddSingleton<IConnectivity>(Connectivity.Current);

    // HttpClient
    builder.Services.AddHttpClient<IApiClient, ApiClient>(c => c.BaseAddress = new Uri("https://api.example.com"));

    // ViewModel & 页面
    builder.Services.AddTransient<UsersViewModel>();
    builder.Services.AddTransient<UsersPage>();

    return builder.Build();
}
```

## Shell 导航

```xml
<Shell xmlns="http://schemas.microsoft.com/dotnet/2021/maui">
    <FlyoutItem Title="Home"><ShellContent ContentTemplate="{DataTemplate views:HomePage}" /></FlyoutItem>
    <FlyoutItem Title="Users"><ShellContent ContentTemplate="{DataTemplate views:UsersPage}" /></FlyoutItem>
</Shell>
```

```csharp
// 注册路由
Routing.RegisterRoute(nameof(UserDetailPage), typeof(UserDetailPage));

// 导航
await Shell.Current.GoToAsync(nameof(UserDetailPage));
await Shell.Current.GoToAsync($"{nameof(UserDetailPage)}?id={userId}");
await Shell.Current.GoToAsync("..", true); // 返回
```

## 接收参数

```csharp
[QueryProperty(nameof(User), "User")]
public partial class UserDetailViewModel : BaseViewModel
{
    [ObservableProperty] private User? _user;
}
```

## 平台特定代码

```csharp
#if ANDROID
    // Android 特定
#elif IOS
    // iOS 特定
#endif

// 或使用条件编译
DeviceInfo.Platform == DevicePlatform.Android
```

## 本地存储

```csharp
// Preferences
Preferences.Set("username", "value");
var username = Preferences.Get("username", "default");

// SecureStorage
await SecureStorage.SetAsync("token", "secret");
var token = await SecureStorage.GetAsync("token");
```

## 常用布局

```xml
<VerticalStackLayout Spacing="10">...</VerticalStackLayout>
<HorizontalStackLayout Spacing="10">...</HorizontalStackLayout>
<Grid RowDefinitions="Auto,*" ColumnDefinitions="*,2*">...</Grid>
<FlexLayout Wrap="Wrap" JustifyContent="SpaceAround">...</FlexLayout>
```

## .NET MAUI 10 新特性

### XAML 源代码生成器

```xml
<PropertyGroup>
  <MauiXamlInflator>SourceGen</MauiXamlInflator>
</PropertyGroup>
```

### 拦截 Web 请求

```csharp
webView.WebResourceRequested += (s, e) =>
{
    if (e.Uri.ToString().Contains("api/secure"))
    {
        e.Handled = true;
        e.SetResponse(200, "OK", "application/json", GetStream());
    }
};
```

### 废弃控件

- `ListView` → 使用 `CollectionView`
- `TableView` → 使用 `CollectionView`
- `MessagingCenter` → 使用 `CommunityToolkit.Mvvm.WeakReferenceMessenger`
