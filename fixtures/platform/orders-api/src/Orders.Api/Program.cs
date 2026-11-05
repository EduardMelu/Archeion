var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapPost("/orders", PlaceOrder);
app.MapGet("/orders/{id}", GetOrder);

var admin = app.MapGroup("/admin");
admin.MapGet("/health", () => "ok");

app.Run();
