# Rediseño visual del Dashboard (estilo Wealthio)

Este ZIP contiene **un solo archivo modificado**: `server/views/admin-dashboard.html`.
Reemplaza el tuyo por este.

## Qué cambié

Solo el **frontend / CSS**, tal como pediste. La lógica (JS de fetch, filtros,
gráficos con Chart.js, modal de respuesta al usuario, estados de pedido,
configuración de cuentas de pago, etc.) quedó exactamente igual.

- **Sidebar**: pasó de fondo casi negro (`#101512`) a fondo blanco con borde
  sutil, ítem activo resaltado en violeta suave — nada de negro.
- **Paleta general**: violeta (`#6C5CE7`) como color primario, con acentos
  en menta (`#16C79A`), coral (`#FF8A65`), azul (`#4C8DFF`) y ámbar
  (`#F5A524`) — igual al estilo de la imagen de referencia.
- **Tarjetas KPI**: ahora con esquinas más redondeadas, sombra suave e
  ícono de color en la esquina (💰 ventas, 📈 ingresos, 👥 usuarios, 📚
  libros), como en el dashboard de referencia.
- **Gráficos (Chart.js)**: se actualizó la paleta de colores de todos
  (ventas, medios de pago, categorías, usuarios por mes, libros por mes)
  para que combinen con la nueva identidad — sigue siendo el mismo tipo de
  gráfico, mismos datos, mismo comportamiento.
- **Tablas, pills de estado, modal de respuesta, formulario de cuentas de
  pago**: mismos componentes, con bordes redondeados y colores actualizados
  a la nueva paleta (rojo/ámbar/verde para "pendiente/esperando/respondido"
  se mantienen como semáforo, solo con tonos más suaves).

## Qué NO cambié

- Ninguna función JavaScript, ningún endpoint, ningún `id` de elemento.
- La vista "Usuarios y pedidos" sigue funcionando exactamente igual.
- El modal de detalle/respuesta, el flujo de estados de pedido y la
  configuración de cuentas de pago no se tocaron en su lógica.
