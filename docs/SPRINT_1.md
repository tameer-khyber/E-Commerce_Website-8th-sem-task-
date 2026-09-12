Sprint 1: System Architecture & Scope Definition

Project: S&P Clovers — Online Store for Shirts & Pants

Section 1: Target Audience & Market Focus

Primary Persona Young adults and students (roughly ages 16–30) who shop casually online, are comfortable using a phone or laptop to buy clothes, and care about price, style, and a smooth checkout experience.

Core Pain Point Many small clothing sellers only sell through Instagram/WhatsApp, which makes browsing, checkout, and order tracking messy. S&P Clovers solves this by giving customers one clean website where they can browse shirts and pants by size/color, add to cart, and check out properly — without needing to message anyone manually.

Domain Scope Apparel / Fashion — specifically casual men's and women's shirts and pants.

Section 2: Minimum Viable Product (MVP) Feature Scope

CategoryFeature NameDescriptionPriorityAuthenticationUser Registration & AuthenticationPassword hashing and JWT-based authentication mechanism.High (MVP)CatalogProduct List & SearchProduct browsing interface with size/color/price filtering and search.High (MVP)CartCart ManagementState-persistent cart management (item addition, modification, deletion).High (MVP)CheckoutOrder ProcessingMock or Stripe payment gateway integration and order object instantiation.High (MVP)AdminInventory ControlAdministrative CRUD operations for product inventory.MediumReviewsRatings & CommentsUsers who purchased a product can leave a star rating and written comment.High (MVP) 

Section 3: Tech Stack Selection & Justification

Frontend Framework: HTML, CSS & JavaScript Justification: Gives full control over markup and styling with zero build-tool setup, which keeps the project manageable within an academic timeline. It can be migrated to a component framework such as React later, but that isn't required to hit MVP scope.

Backend Infrastructure: Node.js with Express Justification: Node.js uses JavaScript on the server too, so one language runs across the whole stack. Express is lightweight, has strong ecosystem support, and has mature packages for JWT authentication, Stripe payments, and file uploads — reducing implementation time versus a heavier framework like Spring Boot.

Database Management System: PostgreSQL Justification: The domain has fixed, predictable relationships (a user has many orders, an order has many items), which favors a relational schema over a document store. PostgreSQL enforces referential integrity and precise decimal handling for prices, and is free and widely supported. MySQL is a viable alternative if hosting availability becomes a constraint.

Caching & Asynchronous Processing (Optional): Redis Justification: Not required for MVP, but applicable later for session-based cart persistence and for dispatching order-confirmation emails asynchronously so checkout requests aren't blocked.

Hosting & Deployment

Backend + Database: Render (Node/Express web service, with a managed PostgreSQL instance on Render or an external provider such as Supabase/ElephantSQL). Render's free tier is sufficient for the traffic this project will see, and deploys automatically on every push to the main branch.

Frontend: Since the frontend is plain HTML/CSS/JS (no build step), it can either be served directly by the Express backend as static files, or hosted separately on Netlify/Vercel for a clean CDN-backed static deployment.

Justification: Keeping backend and database together on Render avoids cross-service network latency for every API call, while serving static files from the same Express app removes CORS configuration entirely — the simplest path to a fully deployed MVP within a semester timeline for a solo developer.

Section 4: Entity-Relationship Diagram (ERD)

Diagram Integration Protocol: Option A — rendered natively as a Mermaid diagram below.

erDiagram USERS ||--o{ ORDERS : places USERS ||--|| CART : owns USERS ||--o{ REVIEWS : writes CART ||--o{ CART_ITEMS : holds PRODUCTS ||--o{ CART_ITEMS : added_as PRODUCTS ||--o{ ORDER_ITEMS : ordered_in PRODUCTS ||--o{ REVIEWS : receives CATEGORIES ||--o{ PRODUCTS : categorizes ORDERS ||--|{ ORDER_ITEMS : contains USERS { INTEGER id PK VARCHAR full_name VARCHAR email UK VARCHAR password_hash VARCHAR phone VARCHAR role TIMESTAMP created_at } CATEGORIES { INTEGER id PK VARCHAR name } PRODUCTS { INTEGER id PK INTEGER category_id FK VARCHAR name VARCHAR description DECIMAL price VARCHAR size VARCHAR color INTEGER stock_quantity VARCHAR image_url } REVIEWS { INTEGER id PK INTEGER product_id FK INTEGER user_id FK INTEGER rating VARCHAR comment TIMESTAMP created_at } CART { INTEGER id PK INTEGER user_id FK UK } CART_ITEMS { INTEGER id PK INTEGER cart_id FK INTEGER product_id FK INTEGER quantity } ORDERS { INTEGER id PK INTEGER user_id FK DECIMAL total_amount VARCHAR status VARCHAR shipping_address VARCHAR tracking_number TIMESTAMP created_at } ORDER_ITEMS { INTEGER id PK INTEGER order_id FK INTEGER product_id FK INTEGER quantity DECIMAL unit_price } 

Attribute Data Type Reference (SQL-compliant)

TableAttributeSQL TypeUsersfull_name, phone, roleVARCHAR(100), VARCHAR(20), VARCHAR(20)UsersemailVARCHAR(150) UNIQUEUserspassword_hashVARCHAR(255)CategoriesnameVARCHAR(100)Productsname, size, color, image_urlVARCHAR(150), VARCHAR(10), VARCHAR(30), VARCHAR(255)ProductsdescriptionVARCHAR(500)ProductspriceDECIMAL(10,2)Productsstock_quantityINTEGERReviewsratingINTEGER (1–5, CHECK constraint)ReviewscommentVARCHAR(500)Cart_Items / Order_ItemsquantityINTEGEROrders / Order_Itemstotal_amount, unit_priceDECIMAL(10,2)OrdersstatusVARCHAR(20) (e.g. pending, paid, shipped, delivered)Ordersshipping_address, tracking_numberVARCHAR(255), VARCHAR(50)All created_at fields—TIMESTAMP DEFAULT CURRENT_TIMESTAMP 

Relationships in Plain Words

One User can place many Orders (1 : N)

One User has exactly one Cart (1 : 1)

One Category (e.g. Shirts) can have many Products (1 : N)

One Order can contain many Order_Items, and each item points to one Product — this is how one order can have multiple products (N : M, resolved through the Order_Items associative entity)

One Cart can hold many Cart_Items, following the same pattern as Orders (N : M, resolved through Cart_Items)

One Product can receive many Reviews, and one User can write many Reviews — each Review links exactly one User to one Product (N : M, resolved through Reviews)

