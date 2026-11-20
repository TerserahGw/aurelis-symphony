FROM gradle:9.2.1-jdk17 AS builder
WORKDIR /src
COPY settings.gradle build.gradle ./
COPY src ./src
RUN gradle --no-daemon installDist

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN addgroup -S aurelis && adduser -S aurelis -G aurelis && mkdir -p /app/data && chown -R aurelis:aurelis /app
COPY --from=builder /src/build/install/aurelis-symphony /app/
ENV PORT=8080 HOST=0.0.0.0 JAVA_TOOL_OPTIONS="-Xms32m -Xmx256m"
USER aurelis
EXPOSE 8080
CMD ["/app/bin/aurelis-symphony"]
