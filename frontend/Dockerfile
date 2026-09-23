# --- Étape 1 : build de l'application React/Vite ---
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
# VITE_API_URL est injecté au build (Vite embarque les variables VITE_* dans le bundle final)
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Étape 2 : image finale, juste Nginx qui sert les fichiers statiques ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Nécessaire pour que le rafraîchissement d'une route React (ex: /dashboard) ne renvoie pas un 404
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
