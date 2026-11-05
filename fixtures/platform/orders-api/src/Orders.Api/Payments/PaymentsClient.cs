namespace Orders.Api.Payments;

public class PaymentsClient(HttpClient _http)
{
    public Task Charge(Payment payment) => _http.PostAsJsonAsync("/charges", payment);
}
