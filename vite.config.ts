VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pug_cocktail_logo.png'],
        manifest: {
          id: '/',
          name: 'Chinmi App - GastroBar & POS',
          short_name: 'ChinmiApp',
          description: 'Sistema de gestión inteligente para restaurantes, bares y comanderos. Control de mesas, inventario y ventas en tiempo real.',
          theme_color: '#e64980',
          background_color: '#111827',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          categories: ['food', 'business', 'productivity', 'utilities'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        }
      })
