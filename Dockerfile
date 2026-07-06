# تطبيق أوقاف دمشق — صورة حاوية جاهزة للنشر على أي خادم
FROM node:20-alpine

WORKDIR /app
COPY . .

# بيانات دائمة (قاعدة البيانات والصور) خارج كود التطبيق
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 3000
CMD ["node", "server.js"]
