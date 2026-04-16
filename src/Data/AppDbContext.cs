using Microsoft.EntityFrameworkCore;
using FarmaciaAgent.Models;

namespace FarmaciaAgent.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<Conversacion> Conversaciones => Set<Conversacion>();
    public DbSet<Mensaje> Mensajes => Set<Mensaje>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Cliente>(e =>
        {
            e.HasKey(c => c.Id);
            e.HasIndex(c => c.Telefono).IsUnique();
        });

        modelBuilder.Entity<Conversacion>(e =>
        {
            e.HasKey(c => c.Id);
            e.HasOne(c => c.Cliente)
             .WithMany(cl => cl.Conversaciones)
             .HasForeignKey(c => c.ClienteId);
        });

        modelBuilder.Entity<Mensaje>(e =>
        {
            e.HasKey(m => m.Id);
            e.HasOne(m => m.Conversacion)
             .WithMany(c => c.Mensajes)
             .HasForeignKey(m => m.ConversacionId);
        });
    }
}
