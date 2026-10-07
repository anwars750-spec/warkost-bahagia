# Work Note — Admin Beverage Stock Read-only

Status: defer until Work quota resets.

UI is already handled outside Work. Do not redesign it.

## Business requirement

Admin prepares beverages only. Admin needs a read-only `Stok` tab that shows only beverage/CASHIER products so Admin can see remaining stock before preparing drinks.

Admin must be able to read:
- product id
- product name
- beverage category
- current stock quantity
- regular price
- item-level promo price/label when the data model supports it

Admin must NOT be able to:
- add stock
- subtract/adjust stock
- edit products
- edit prices
- create/edit promotions
- view Kitchen-only stock through this Admin endpoint

## Security / backend requirement

Do not solve this by granting broad `STOCK_READ` if that exposes all Kitchen stock unnecessarily.
Prefer a narrow server-authoritative endpoint/capability for Admin beverage stock, for example:

`GET /api/admin-beverage-stock`

The endpoint should return only products where `prep_station='CASHIER'` (current internal beverage station identifier), with read-only fields needed by the approved Admin UI.

No write action should be accepted from this surface.

## UI contract already implemented

The Admin UI already expects `GET /api/admin-beverage-stock` and can render the page before backend wiring.
Expected response shape:

```json
{
  "products": [
    {
      "id": 1,
      "name": "Kopi Susu Rumah",
      "category_name": "Minuman",
      "prep_station": "CASHIER",
      "stock_quantity": 12,
      "price": 18000,
      "promo_price": null,
      "promo_label": null
    }
  ]
}
```

Price may currently come from public menu data, but the narrow endpoint may include it to keep the read model consistent.

## Verification

Targeted tests:
- Admin can read beverage/CASHIER stock.
- Admin cannot receive Kitchen products from this endpoint.
- Admin cannot mutate stock through this feature.
- Admin still cannot use stock adjustment endpoints.
- Manager/Owner stock workflows remain unchanged.
- Unauthenticated users rejected.
- Other roles do not gain unintended access.

Do targeted tests first, focused RBAC regression second, build last.
