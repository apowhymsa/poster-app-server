require('dotenv').config()
const axios = require('axios');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const express = require('express');
const {createHash} = require("crypto");
const app = express();

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

const str_to_sign = function str_to_sign(str) {
    if (typeof str !== 'string') {
        throw new Error('Input must be a string');
    }

    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    return sha1.digest('base64');
};

app.get('/', (req, res) => {
    res.send(process.env.LIQPAY_PUBLIC_KEY);
})

app.post('/payment', (req, res) => {
    const {amount, currency, description} = req.body;

    const params = {
        action: 'pay',
        amount: amount,
        currency: currency,
        description: description,
        public_key: process.env.LIQPAY_PUBLIC_KEY,
        private_key: process.env.LIQPAY_PRIVATE_KEY,
        server_url: 'http://localhost:6789/payment/callback',
    }

    const data = Buffer.from(JSON.stringify(params)).toString('base64');
    const signature = str_to_sign(process.env.LIQPAY_PRIVATE_KEY + data + process.env.LIQPAY_PRIVATE_KEY);

    axios.post('https://www.liqpay.ua/api/3/checkout', {
        data: data,
        signature: signature
    }, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    })
        .then(data => {
            const paymentURL = data.request.res.responseUrl;
            res.status(200).send(paymentURL);
        })
        .catch(error => res.status(404).send(JSON.stringify({
            errorCode: error.code,
            errorNo: error.errno
        })));
})

app.post('/payment/callback', (req, res) => {
    console.log('OK', req, res);
})

app.listen(process.env.PORT, () => {
    console.log('server running')
})