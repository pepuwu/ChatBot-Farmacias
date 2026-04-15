namespace FarmaciaAgent.Models;

public class FarmaciaConfig
{
    public string Nombre { get; set; } = "";
    public string Whatsapp { get; set; } = "";
    public string Direccion { get; set; } = "";
    public HorariosConfig Horarios { get; set; } = new();
    public bool Delivery { get; set; }
    public string ZonaDelivery { get; set; } = "";
    public List<string> ObrasSociales { get; set; } = new();
    public List<string> Servicios { get; set; } = new();
    public string TelegramAdminId { get; set; } = "";
    public string MensajeBienvenida { get; set; } = "";
    public string MensajeDerivacion { get; set; } = "";
    public int TiempoSesionMinutos { get; set; } = 10;
    public string DbPath { get; set; } = "./data/farmacia.db";
}

public class HorariosConfig
{
    public string Semana { get; set; } = "";
    public string Sabado { get; set; } = "";
    public string Domingo { get; set; } = "";
}
