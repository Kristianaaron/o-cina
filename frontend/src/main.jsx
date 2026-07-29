import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { store } from './lib/store/store'
import './index.css'

// Vite BASE_URL is `/` in dev and `/static/` in production builds
const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter basename={basename === '/' ? undefined : basename}>
        <App />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>,
)
