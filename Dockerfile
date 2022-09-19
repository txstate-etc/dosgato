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
COPY test/files/blankpdf.pdf /files/storage/d7/31/d520ca21a90b2ca28b5068cfdd678dbd3ace
COPY test/files/bobcat.jpg /files/storage/6c/e1/19a866c6821764edcdd5b30395d0997c8aff

CMD [ "npm", "start" ]
