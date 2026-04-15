using Microsoft.EntityFrameworkCore;
using FarmaciaAgent.Data;
using FarmaciaAgent.Models;

namespace FarmaciaAgent.Services;

public class StockService
{
    private readonly AppDbContext _db;
    private readonly ILogger<StockService> _logger;

    public StockService(AppDbContext db, ILogger<StockService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<Producto?> BuscarProducto(string nombre)
    {
        var nombreLower = nombre.ToLower();
        return await _db.Productos
            .Where(p => p.Nombre.ToLower().Contains(nombreLower))
            .FirstOrDefaultAsync();
    }

    public async Task<List<Producto>> GetTodoElStock()
    {
        return await _db.Productos.OrderBy(p => p.Nombre).ToListAsync();
    }

    public async Task<List<Producto>> GetStockBajo(int umbral = 5)
    {
        return await _db.Productos.Where(p => p.Stock <= umbral).ToListAsync();
    }

    public async Task ActualizarStock(string nombreProducto, int cantidad)
    {
        var producto = await BuscarProducto(nombreProducto);

        if (producto is null)
        {
            producto = new Producto { Nombre = nombreProducto, Stock = cantidad, UpdatedAt = DateTime.UtcNow };
            _db.Productos.Add(producto);
            _logger.LogInformation("Producto nuevo creado: {Nombre} x{Cantidad}", nombreProducto, cantidad);
        }
        else
        {
            producto.Stock += cantidad;
            producto.UpdatedAt = DateTime.UtcNow;
            _logger.LogInformation("Stock actualizado: {Nombre} +{Cantidad} = {Total}", nombreProducto, cantidad, producto.Stock);
        }

        await _db.SaveChangesAsync();
    }

    public async Task<List<ListaEspera>> GetListaEsperaPorProducto(string nombreProducto)
    {
        var nombreLower = nombreProducto.ToLower();
        return await _db.ListaEspera
            .Include(l => l.Cliente)
            .Where(l => l.ProductoNombre.ToLower().Contains(nombreLower) && !l.Notificado)
            .ToListAsync();
    }

    public async Task AgregarAListaEspera(int clienteId, string productoNombre)
    {
        var existe = await _db.ListaEspera
            .AnyAsync(l => l.ClienteId == clienteId && l.ProductoNombre == productoNombre && !l.Notificado);

        if (!existe)
        {
            _db.ListaEspera.Add(new ListaEspera
            {
                ClienteId = clienteId,
                ProductoNombre = productoNombre,
                CreatedAt = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();
        }
    }

    public async Task MarcarNotificados(List<int> ids)
    {
        var items = await _db.ListaEspera.Where(l => ids.Contains(l.Id)).ToListAsync();
        foreach (var item in items)
            item.Notificado = true;
        await _db.SaveChangesAsync();
    }
}
