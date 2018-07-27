/*******************************************************************************
 *
 *    Copyright 2018 Adobe. All rights reserved.
 *    This file is licensed to you under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License. You may obtain a copy
 *    of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software distributed under
 *    the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 *    OF ANY KIND, either express or implied. See the License for the specific language
 *    governing permissions and limitations under the License.
 *
 ******************************************************************************/

'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const HttpStatus = require('http-status-codes');
const setup = require('../lib/setupIT.js').setup;
const extractToken = require('../lib/setupIT').extractToken;
const expect = chai.expect;
const OAUTH_TOKEN_NAME = require('../../src/common/constants').OAUTH_TOKEN_NAME;
chai.use(chaiHttp);


describe('commercetools getCart', function() {

    describe('Integration tests', function() {

        // Get environment
        let env = setup();

        // Increase test timeout
        this.slow(env.slow);
        this.timeout(env.timeout);

        let cartId;
        let accessToken;

        const productVariantId = '90ed1673-4553-47c6-9336-5cb23947abb2-1';

        /** Create cart. */
        before(function() {
            return chai.request(env.openwhiskEndpoint)
                .post(env.cartsPackage + 'postCart')
                .query({
                    currency: 'USD',
                    quantity: 2,
                    productVariantId: productVariantId
                })
                .set('Accept-Language', 'en-US')
                .then(function (res) {
                    expect(res).to.be.json;
                    expect(res).to.have.status(HttpStatus.CREATED);
                    expect(res.body.id).to.not.be.empty;

                    // Store cart id
                    cartId = res.body.id;
                    // Store token to access the anonymous session
                    accessToken = extractToken(res);
                })
                .catch(function(err) {
                    throw err;
                });
        });

        it('returns a cart for a valid cart id', function() {
            return chai.request(env.openwhiskEndpoint)
                .get(env.cartsPackage + 'getCart')
                .query({id: cartId})
                .set('Accept-Language', 'en-US')
                .set('cookie', `${OAUTH_TOKEN_NAME}=${accessToken};`)
                .then(function (res) {
                    expect(res).to.be.json;
                    expect(res).to.have.status(HttpStatus.OK);

                    // Verify structure
                    expect(res.body).to.have.own.property('lastModifiedDate');
                    expect(res.body).to.have.own.property('totalProductPrice');
                    expect(res.body).to.have.own.property('id');
                    expect(res.body).to.have.own.property('coupons');
                    expect(res.body.id).to.equal(cartId);
                    expect(res.body).to.have.own.property('createdDate');
                    expect(res.body).to.have.own.property('cartEntries');
                    expect(res.body.cartEntries).to.have.lengthOf(1);

                    const entry = res.body.cartEntries[0];
                    expect(entry).to.have.own.property('quantity');
                    expect(entry.quantity).to.equal(2);
                    expect(entry).to.have.own.property('unitPrice');
                    expect(entry).to.have.own.property('productVariant');
                    expect(entry.productVariant).to.have.own.property('id');
                    expect(entry.productVariant.id).to.equal(productVariantId);
                    expect(entry).to.have.own.property('id');
                    expect(entry).to.have.own.property('cartEntryPrice');
                })
                .catch(function(err) {
                    throw err;
                });
        });

        it('returns a cart which contains at least one cart discount', () => {
            const checkDiscountData = (response, statusCode) => {
                expect(response).to.be.json;
                expect(response).to.have.status(statusCode);
                expect(response.body.id).to.not.be.empty;
                expect(response.body).to.have.own.property('cartEntries');
                expect(response.body.cartEntries).to.have.lengthOf(1);

                const entry = response.body.cartEntries[0];
                expect(entry).to.have.own.property('quantity');
                expect(entry.quantity).to.equal(71);
                expect(entry).to.have.own.property('discountedCartEntryPrice');
                expect(entry).to.have.own.property('discounts');

                entry.discounts.forEach(discount => {
                    expect(discount).to.have.own.property('discountedAmount');
                    expect(discount).to.have.own.property('name');
                    expect(discount).to.have.own.property('id');
                    expect(discount).to.have.own.property('message');
                    expect(discount).to.have.own.property('type');
                });
            };

            const postData =  {
                currency: 'USD',
                quantity: 71,
                productVariantId: productVariantId
            };
            return chai.request(env.openwhiskEndpoint)
                .post(env.cartsPackage + 'postCart')
                .query(postData)
                .set('Accept-Language', 'en-US')
                .set('cookie', `${OAUTH_TOKEN_NAME}=${accessToken};`)
                .then(function (response) {
                    // Response of cart creation must also contain the discount data
                    checkDiscountData(response, HttpStatus.CREATED);
                    return chai.request(env.openwhiskEndpoint)
                        .get(env.cartsPackage + 'getCart')
                        .query({id: response.body.id})
                        .set('Accept-Language', 'en-US')
                        .set('cookie', `${OAUTH_TOKEN_NAME}=${accessToken};`);
                })
                .then(response => checkDiscountData(response, HttpStatus.OK));
        });

        it('returns a 400 error for a missing id parameter', function() {
            return chai.request(env.openwhiskEndpoint)
                .get(env.cartsPackage + 'getCart')
                .set('Accept-Language', 'en-US')
                .set('cookie', `${OAUTH_TOKEN_NAME}=${accessToken};`)
                .catch(function(err) {
                    expect(err.response).to.have.status(HttpStatus.BAD_REQUEST);
                });
        });

        it('returns a 404 error for a non existent cart', function() {
            return chai.request(env.openwhiskEndpoint)
                .get(env.cartsPackage + 'getCart')
                .query({id: 'does-not-exist'})
                .set('Accept-Language', 'en-US')
                .set('cookie', `${OAUTH_TOKEN_NAME}=${accessToken};`)
                .catch(function(err) {
                    expect(err.response).to.have.status(HttpStatus.NOT_FOUND);
                });
        });

        it('returns a cart with tax info', function () {
            const args = {
                id: cartId,
                shippingMethodId: '6f0b3638-73a5-4d80-8455-081d3e9f98bb'
            };

            //set a shipping address
            return chai.request(env.openwhiskEndpoint)
                .post(env.cartsPackage + 'postShippingAddress')
                .query({id: cartId})
                .send({address: {country: 'US'}})
                .set('Accept-Language', 'en-US')
                .set('cookie', `${OAUTH_TOKEN_NAME}=${accessToken};`)
                .then(function (res) {
                    expect(res).to.be.json;
                    expect(res).to.have.status(HttpStatus.OK);

                    return chai.request(env.openwhiskEndpoint)
                        .post(env.cartsPackage + 'postShippingMethod')
                        .query(args)
                        .set('Accept-Language', 'en-US')
                        .set('cookie', `${OAUTH_TOKEN_NAME}=${accessToken};`);
                })
                .then(function (res) {
                    expect(res).to.be.json;
                    expect(res).to.have.status(HttpStatus.OK);

                    expect(res.body).to.have.property('cartTaxInfo');
                    expect(res.body).to.have.property('taxIncludedInPrices');
                    expect(res.body).to.have.property('netTotalPrice');
                    expect(res.body).to.have.property('grossTotalPrice');
                    let cartTaxInfo = res.body.cartTaxInfo;
                    checkTaxInfo(cartTaxInfo);

                    expect(res.body).to.have.property('shippingInfo');
                    expect(res.body.shippingInfo).to.have.property('shippingTaxInfo');
                    let shippingTaxInfo = res.body.shippingInfo.shippingTaxInfo;
                    checkTaxInfo(shippingTaxInfo);

                    expect(res.body).to.have.property('cartEntries');
                    let cartEntries = res.body.cartEntries;
                    cartEntries.every(cartEntry => {
                        let cartEntryTaxInfo = cartEntry.cartEntryTaxInfo;
                        checkTaxInfo(cartEntryTaxInfo);
                    });
                });
        });

    });
});

function checkTaxInfo(taxItem) {
    expect(taxItem).to.have.property('totalCentAmount');
    expect(taxItem).to.have.property('taxPortions');
    taxItem.taxPortions.every(taxPortion => expect(taxPortion).to.have.all.keys('name', 'centAmount'));
}