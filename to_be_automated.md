# To Be Automated

## SauceDemo — Complete Purchase Journey (E2E)

Site: https://www.saucedemo.com/

An end-to-end scenario chaining together most of the site's functionality
(auth, product listing/sorting, cart state, multi-step checkout form, order
confirmation, session teardown) into one coherent user journey. Intended as
a smoke/regression test on top of the smaller, narrower-scope tests already
covering login and add-to-cart individually.

### Steps

1. **Login** — go to `saucedemo.com`, log in as `standard_user` / `secret_sauce`.
2. **Browse & sort** — on the inventory page, use the sort dropdown to order
   products (e.g. "Price low to high") and verify the order changes.
3. **Add multiple items to cart** — add 2–3 specific products to the cart,
   verify the cart badge count updates after each add, and verify each
   product's button changes from "Add to cart" to "Remove".
4. **Review cart** — open the cart page, verify the correct items/prices/
   quantities are listed, then remove one item and verify the badge/cart
   update.
5. **Checkout — info step** — proceed to checkout, fill in first name, last
   name, and zip/postal code, continue.
6. **Checkout — overview step** — verify the order summary (item list, item
   total, tax, total) matches what was in the cart.
7. **Complete order** — finish the checkout, verify the "Thank you for your
   order" completion page/message.
8. **Post-purchase state** — navigate back to products (via "Back Home"),
   verify the cart is now empty (badge gone).
9. **Logout** — open the side menu, log out, verify redirect back to the
   login page.

### Notes for whoever automates this

- Out of scope for the existing login/cart slice already in the repo —
  this scenario deliberately covers checkout, sorting, and logout, which
  that slice explicitly excludes.
- Per this repo's CLAUDE.md rules: explore the checkout pages (info step,
  overview step, completion page) with `npx playwright codegen --output
  docs/exploration/<slug>-codegen.ts https://www.saucedemo.com/` in headed
  mode before writing any test code — do not assume locators/copy from this
  doc.
