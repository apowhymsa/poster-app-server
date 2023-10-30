require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const express = require("express");
const { createHash } = require("crypto");
const cors = require("cors");
const app = express();

const processedPayments = {};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(
    cors({
        credentials: true,
    }),
);

const str_to_sign = function str_to_sign(str) {
    if (typeof str !== "string") {
        throw new Error("Input must be a string");
    }

    const sha1 = crypto.createHash("sha1");
    sha1.update(str);
    return sha1.digest("base64");
};

app.get("/", (req, res) => {
    res.send(process.env.LIQPAY_PUBLIC_KEY);
});

app.post("/result", (req, res) => {
    const encodedData = req.body.data;
    const decodedData = Buffer.from(encodedData, "base64").toString("utf-8");

    const { status } = JSON.parse(decodedData);

    res.cookie("cookie", status, {
        maxAge: 1000 * 60 * 15,
    });

    return res.send(
        `RESULT: ${
            status === "success"
                ? '<div style="color: green">SUCCESS</div>'
                : '<div style="color: red">ERROR</div>'
        }`,
    );
});

app.post("/payment", (req, res) => {
    const { amount, description, posterData } = req.body;

    const params = {
        action: "pay",
        amount: amount,
        currency: "UAH",
        description: description,
        info: JSON.stringify({
            products: posterData.products.map((product) => {
                return {
                    count: product.count,
                    product_id: product.product_id,
                };
            }),
            phone: posterData.phone,
            shippingAddress: posterData.shippingAddress,
            name: posterData.name,
        }),
        public_key: process.env.LIQPAY_PUBLIC_KEY,
        // private_key: process.env.LIQPAY_PRIVATE_KEY,
        server_url: "https://poster-shop-server.onrender.com/payment/callback",
        result_url: "https://poster-shop-server.onrender.com/result",
    };

    const data = Buffer.from(JSON.stringify(params)).toString("base64");
    const signature = str_to_sign(
        process.env.LIQPAY_PRIVATE_KEY + data + process.env.LIQPAY_PRIVATE_KEY,
    );

    axios
        .post(
            "https://www.liqpay.ua/api/3/checkout",
            {
                data: data,
                signature: signature,
            },
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            },
        )
        .then((data) => {
            const paymentURL = data.request.res.responseUrl;
            res.status(200).send({ paymentURL: paymentURL });
        })
        .catch((error) =>
            res.status(404).send(
                JSON.stringify({
                    errorCode: error.code,
                    errorNo: error.errno,
                }),
            ),
        );
});

app.post("/payment/callback", async (req, res) => {
    const encodedData = req.body.data;
    const reqSignature = req.body.signature;

    const decodedData = Buffer.from(encodedData, "base64").toString("utf-8");

    const { payment_id, status, info, order_id, amount, description } =
        JSON.parse(decodedData);

    const origSig = str_to_sign(
        process.env.LIQPAY_PRIVATE_KEY +
        encodedData +
        process.env.LIQPAY_PRIVATE_KEY,
    );

    if (reqSignature === origSig && status === "success") {
        console.log("dec", decodedData);

        const orderParams = {
            spot_id: 1,
            phone: JSON.parse(info).phone,
            products: JSON.parse(info).products,
            first_name: JSON.parse(info).name,
            comment: `Адрес доставки указаный при оплате: ${
                JSON.parse(info).shippingAddress
            }`,
            payment: {
                type: 1,
                sum: amount * 100,
                currency: "UAH",
            },
        };

        console.log(orderParams);
        await axios
            .post(
                `https://joinposter.com/api/incomingOrders.createIncomingOrder?token=${process.env.POSTER_API_KEY}`,
                {
                    ...orderParams,
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            )
            .then((res) => console.log("added", res.data))
            .catch((err) => console.error("err", err));

        return res.status(200).send("test send");
    }
});

app.listen(process.env.PORT, () => {
    console.log("server running");
});
