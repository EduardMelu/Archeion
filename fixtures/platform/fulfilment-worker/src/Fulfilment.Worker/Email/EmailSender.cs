namespace Fulfilment.Worker.Email;

public class EmailSender
{
    public Task Send(string to, string template) => Task.CompletedTask;
}
