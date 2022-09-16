FROM node:18-alpine as build
WORKDIR /usr/app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src src
COPY testserver testserver

RUN npm run buildrun

FROM node:18-alpine
RUN apk add build-base
RUN apk add vips-heif libheif-dev vips-dev --repository=http://dl-cdn.alpinelinux.org/alpine/edge/community
WORKDIR /usr/app
COPY package.json ./
RUN npm install --production --no-optional
RUN apk del --purge build-base && rm -rf /var/cache/apk/*
COPY --from=build /usr/app/dist dist
COPY tsconfig.json ./

CMD [ "npm", "start" ]
