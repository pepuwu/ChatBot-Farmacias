namespace FarmaciaAgent.Models;

public class Conversacion
{
    public int Id { get; set; }
    public int ClienteId { get; set; }
    public string Estado { get; set; } = "bot"; // bot | farmaceutico | espera
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Cliente? Cliente { get; set; }
    public ICollection<Mensaje> Mensajes { get; set; } = new List<Mensaje>();
}

public class Mensaje
{
    public int Id { get; set; }
    public int ConversacionId { get; set; }
    public string Role { get; set; } = ""; // user | assistant | farmaceutico
    public string Contenido { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Conversacion? Conversacion { get; set; }
}

public class ListaEspera
{
    public int Id { get; set; }
    public int ClienteId { get; set; }
    public string ProductoNombre { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool Notificado { get; set; } = false;

    public Cliente? Cliente { get; set; }
}
