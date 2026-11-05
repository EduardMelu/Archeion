namespace Fulfilment.Worker;

public class Worker(ServiceBusClient client) : BackgroundService
{
    private readonly ServiceBusProcessor _orders = client.CreateProcessor("order-submitted", "fulfilment");
}
