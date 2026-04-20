# Sistema de Gestión Empresarial Multi-Sucursal

## 📌 Descripción

Sistema diseñado para una empresa distribuidora con múltiples sucursales, enfocado en la gestión de inventario, ventas, compras y logística.

El sistema centraliza las operaciones y permite mejorar el control y la trazabilidad de los procesos empresariales.

---

## 🧠 Enfoque

El sistema sigue un enfoque tipo:

- ERP: integración de procesos (ventas, inventario, compras)
- CRM: gestión de clientes
- SCM: control de inventario y logística

---

## 🏗️ Arquitectura

- Base de datos: MySQL
- Backend: Node.js (en desarrollo)
- Interfaz: Web

---

## 🧩 Funcionalidades

- Gestión de clientes
- Control de inventario por bodega
- Ventas y compras
- Traslados entre sucursales
- Entregas a clientes
- Control de roles y permisos
- Bitácora de operaciones

---

## 📊 Modelo de datos

(Insertar imagen del modelo ER aquí)

---

## ⚙️ Ejemplo de consulta

```sql
SELECT p.nombre, i.cantidad
FROM Inventario i
JOIN Producto p ON i.id_producto = p.id_producto
WHERE i.cantidad < i.cantidad_minima;
