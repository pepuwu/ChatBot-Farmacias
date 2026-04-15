namespace FarmaciaAgent.Models;

public class Cliente
{
    public int Id { get; set; }
    public string Telefono { get; set; } = "";
    public string Nombre { get; set; } = "";
    public DateTime UltimaInteraccion { get; set; } = DateTime.UtcNow;

    public ICollection<Conversacion> Conversaciones { get; set; } = new List<Conversacion>();
}
