FROM node:22-alpine AS build
WORKDIR /usr/app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src src
COPY testserver testserver

RUN npm run buildrun

FROM node:22-alpine
WORKDIR /usr/app
COPY package.json ./
RUN npm install --omit=dev --omit=optional
COPY --from=build /usr/app/dist dist
COPY tsconfig.json ./
COPY test/files/blankpdf.pdf /files/storage/P/K/BUoghpogATqmK14ry1wqKsP-e-S8GVqHKuCxH7k1k
COPY test/files/bobcat.jpg /files/storage/Q/7/HN1moFtRWxE_gLyvxM8B2sK5CrjB3482LttjgbWME
RUN node -e 'console.log(new Date().getTime())' > /.builddate

CMD [ "npm", "start" ]
