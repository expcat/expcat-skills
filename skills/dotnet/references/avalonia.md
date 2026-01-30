# Avalonia UI Best Practices

跨平台 .NET UI 框架，支持 Windows/macOS/Linux/iOS/Android/WebAssembly。

## 快速开始

```bash
dotnet new install Avalonia.Templates
dotnet new avalonia.mvvm -n MyApp
```

## 项目结构

```
MyApp/
├── App.axaml         # 应用资源和主题
├── ViewModels/       # MVVM ViewModels
├── Views/            # XAML 视图
└── Assets/           # 资源
```

## 基础控件

```xml
<Button Content="Click" Command="{Binding ClickCommand}" />
<TextBox Text="{Binding Name}" Watermark="Enter name..." />
<ComboBox ItemsSource="{Binding Items}" SelectedItem="{Binding Selected}" />
<ListBox ItemsSource="{Binding Items}" SelectionMode="Multiple" />
<CheckBox IsChecked="{Binding IsEnabled}" Content="Enable" />
<RadioButton GroupName="Options" Content="Option 1" />
```

## 布局

```xml
<StackPanel Orientation="Vertical" Spacing="10">...</StackPanel>
<Grid RowDefinitions="Auto,*" ColumnDefinitions="*,2*">
    <Button Grid.Row="0" Grid.Column="0" />
</Grid>
<DockPanel LastChildFill="True">
    <Menu DockPanel.Dock="Top" /><ContentControl />
</DockPanel>
<WrapPanel Orientation="Horizontal">...</WrapPanel>
```

## 数据绑定

```xml
<TextBlock Text="{Binding Name}" />
<TextBox Text="{Binding Name, Mode=TwoWay}" />
<TextBlock IsVisible="{Binding HasItems, Converter={StaticResource BoolConverter}}" />
<Button Command="{Binding SaveCommand}" CommandParameter="{Binding Item}" />

<ItemsControl ItemsSource="{Binding Items}">
    <ItemsControl.ItemTemplate>
        <DataTemplate><TextBlock Text="{Binding Name}" /></DataTemplate>
    </ItemsControl.ItemTemplate>
</ItemsControl>
```

## MVVM (CommunityToolkit.Mvvm)

```csharp
public partial class MainViewModel : ObservableObject
{
    [ObservableProperty] private string _name = "";
    [ObservableProperty][NotifyCanExecuteChangedFor(nameof(SaveCommand))] private bool _canSave;

    [RelayCommand(CanExecute = nameof(CanSave))]
    private async Task SaveAsync() => await _service.SaveAsync(Name);
}
```

### ReactiveUI (可选)

```csharp
public class MainViewModel : ReactiveObject
{
    private string _name = "";
    public string Name { get => _name; set => this.RaiseAndSetIfChanged(ref _name, value); }
    public ReactiveCommand<Unit, Unit> SaveCommand { get; }

    public MainViewModel()
    {
        SaveCommand = ReactiveCommand.CreateFromTask(SaveAsync,
            this.WhenAnyValue(x => x.Name, n => !string.IsNullOrEmpty(n)));
    }
}
```

## 样式系统

```xml
<Window.Styles>
    <Style Selector="Button"><Setter Property="Background" Value="#0078d4" /></Style>
    <Style Selector="TextBlock.h1">
        <Setter Property="FontSize" Value="24" />
        <Setter Property="FontWeight" Value="Bold" />
    </Style>
    <Style Selector="Button:pointerover"><Setter Property="Background" Value="#106ebe" /></Style>
    <Style Selector="Button.primary">
        <Setter Property="Background" Value="Blue" />
        <Style Selector="^:disabled"><Setter Property="Opacity" Value="0.5" /></Style>
    </Style>
</Window.Styles>

<TextBlock Classes="h1">Heading</TextBlock>
<Button Classes="primary">Primary</Button>
```

### 选择器语法

| 选择器   | 说明   | 选择器         | 说明     |
| -------- | ------ | -------------- | -------- |
| `Button` | 类型   | `:pointerover` | 悬停     |
| `.class` | 类     | `:pressed`     | 按下     |
| `#name`  | 名称   | `:disabled`    | 禁用     |
| `>`      | 子元素 | `^`            | 嵌套父级 |

## 主题

```xml
<Application.Styles><FluentTheme /></Application.Styles>

<!-- 主题变体 -->
<FluentTheme>
    <FluentTheme.Palettes>
        <ColorPaletteResources x:Key="Light" Accent="#0078d4" />
        <ColorPaletteResources x:Key="Dark" Accent="#60cdff" />
    </FluentTheme.Palettes>
</FluentTheme>
```

```csharp
Application.Current!.RequestedThemeVariant = ThemeVariant.Dark; // 切换主题
```

## 资源

```xml
<Application.Resources>
    <ResourceDictionary>
        <Color x:Key="Primary">#0078d4</Color>
        <SolidColorBrush x:Key="PrimaryBrush" Color="{StaticResource Primary}" />
        <ResourceDictionary.MergedDictionaries>
            <ResourceInclude Source="/Assets/Colors.axaml" />
        </ResourceDictionary.MergedDictionaries>
    </ResourceDictionary>
</Application.Resources>
```

## 控件模板

```xml
<Style Selector="Button.custom">
    <Setter Property="Template">
        <ControlTemplate>
            <Border Background="{TemplateBinding Background}" CornerRadius="4" Padding="{TemplateBinding Padding}">
                <ContentPresenter Content="{TemplateBinding Content}" HorizontalAlignment="Center" />
            </Border>
        </ControlTemplate>
    </Setter>
</Style>
```

## 自定义属性

```csharp
public partial class MyControl : UserControl
{
    public static readonly StyledProperty<string> TitleProperty =
        AvaloniaProperty.Register<MyControl, string>(nameof(Title));
    public string Title { get => GetValue(TitleProperty); set => SetValue(TitleProperty, value); }
}
```

## 对话框

```csharp
await new SettingsWindow { DataContext = vm }.ShowDialog(this); // 模态
var files = await StorageProvider.OpenFilePickerAsync(new FilePickerOpenOptions
{
    Title = "Select", FileTypeFilter = [new("Text") { Patterns = ["*.txt"] }]
});
```

## 平台检测

```csharp
if (OperatingSystem.IsWindows()) { } else if (OperatingSystem.IsMacOS()) { } else if (OperatingSystem.IsLinux()) { }
```

## 常用包

`Avalonia.Themes.Fluent` `CommunityToolkit.Mvvm` `ReactiveUI.Avalonia` `Avalonia.Xaml.Behaviors` `Material.Avalonia` `Semi.Avalonia`

## WPF 差异

| WPF          | Avalonia              |
| ------------ | --------------------- |
| `.xaml`      | `.axaml`              |
| `Style`+模板 | `ControlTheme`        |
| `Trigger`    | 选择器 `:pointerover` |
