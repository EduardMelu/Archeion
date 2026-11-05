namespace Fulfilment.Worker.Shipping;

public class CarrierClient(HttpClient _http, IConfiguration config)
{
    // Dynamic URL: reported as unsupported, never guessed.
    public Task Book(Shipment s) => _http.PostAsJsonAsync(config["Carrier:Url"], s);

    // Dynamic topic: its broker link is not claimed.
    public void Listen(ServiceBusClient bus, string topic) => bus.CreateReceiver(topic);
}
