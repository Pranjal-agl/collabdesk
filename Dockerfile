# ---- Stage 1: build the Angular app -----------------------------------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build -- --configuration production

# ---- Stage 2: build the Spring Boot jar, embedding the Angular build ---
FROM maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /app/backend
COPY backend/pom.xml ./
RUN mvn -B dependency:go-offline
COPY backend/src ./src
# Angular's "application" builder outputs to dist/<project>/browser. Placing
# it under src/main/resources/static makes Spring Boot serve it as-is - same
# origin as /api and /ws, so there's no CORS to configure in production.
COPY --from=frontend-build /app/frontend/dist/collabdesk/browser ./src/main/resources/static
RUN mvn -B clean package -DskipTests

# ---- Stage 3: slim runtime image ---------------------------------------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=backend-build /app/backend/target/*.jar app.jar

# Render (and most free PaaS) inject $PORT and expect the app to bind to it.
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java -Dserver.port=${PORT} -jar app.jar"]
