namespace Orders.Api.Documents;

public class InvoicePdfRenderer
{
    public byte[] Render(string id) => QuestPdfDocument.For(id).GeneratePdf();
}
