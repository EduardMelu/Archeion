namespace Orders.Api.Events;

public class OrderEvents(ServiceBusClient client)
{
    private readonly ServiceBusSender _sender = client.CreateSender("order-submitted");
}
