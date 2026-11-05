namespace Orders.Api.Invoices;

[ApiController]
[Route("invoices")]
public class InvoicesController : ControllerBase
{
    [HttpGet("{id}/pdf")]
    public IActionResult Pdf(string id) => File(new InvoicePdfRenderer().Render(id), "application/pdf");
}
