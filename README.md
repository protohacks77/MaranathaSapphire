# Morgenster Hospital Management System

## Netlify Deployment Configuration

To deploy this React Single Page Application (SPA) to Netlify successfully and prevent 404 errors on page refresh (blank pages), you must configure the build settings and redirects.

### Step 1: Create `netlify.toml`

Create a file named `netlify.toml` in the root directory of your project.

### Step 2: Add the Configuration Code

Copy and paste the following code into your `netlify.toml` file:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Why is this needed?

*   **[build]**: Tells Netlify to use Vite to build your app (`npm run build`) and serves the files from the generated `dist` folder.
*   **[[redirects]]**: This is crucial for SPAs. It redirects all requests (`/*`) to `index.html`. This allows React Router to handle the URL paths (like `/admin/users` or `/patients/123`) on the client side instead of Netlify looking for a physical folder that doesn't exist.

## Local Development

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Start Dev Server:**
    ```bash
    npm run dev
    ```

3.  **Build for Production:**
    ```bash
    npm run build
    ```
