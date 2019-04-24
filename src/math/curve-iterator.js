Object.assign(pc, (function () {
    'use strict';

    /**
     *
     * @constructor
     * @name pc.CurveIterator
     * @classdesc CurveIterator performs fast evaluation of a curve by caching
     * knot information where possible.
     * @description Creates a new curve iterator.
     * @param {Curve} curve The curve to iterator over
     * @param {Number} time The time to start iteration, defaults to 0.
     */
    var CurveIterator = function (curve, time) {
        this.curve = curve;
        this.time_ = time || 0;
        this.left = -Infinity;
        this.right = Infinity;
        this.recip = 0;
        this.p0 = 0;
        this.p1 = 0;
        this.m0 = 0;
        this.m1 = 0;

        this.reset(this.time_);
    };

    Object.assign(CurveIterator.prototype, {
        /**
         * @function
         * @name pc.CurveIterator#reset
         * @description Reset the iterator to the specified time
         * @param {Number} time The new time for the iterator
         */
        reset: function (time) {
            var keys = this.curve.keys;
            var len = keys.length;

            this.time_ = time;
            if (!len) {
                // curve is empty
                this.left = -Infinity;
                this.right = Infinity;
                this.recip = 0;
                this.p0 = this.p1 = this.m0 = this.m1 = 0;
            } else {
                if (this.time_ < keys[0][0]) {
                    // iterator falls to the left of the start of the curve
                    this.left = -Infinity;
                    this.right = keys[0][0];
                    this.recip = 0;
                    this.p0 = this.p1 = keys[0][1];
                    this.m0 = this.m1 = 0;
                } else if (this.time_ >= keys[len - 1][0]) {
                    // iterator falls to the right of the end of the curve
                    this.left = keys[len - 1][0];
                    this.right = Infinity;
                    this.recip = 0;
                    this.p0 = this.p1 = keys[len - 1][1];
                    this.m0 = this.m1 = 0;
                } else {
                    // iterator falls within the bounds of the curve
                    // perform a linear search for the key just the to left of the
                    // current time.
                    // (TODO: for cases where the curve has more than 'n' keys it will
                    // be more efficient to perform a binary search here instead. Which is
                    // straight forward thanks to the sorted list of knots).
                    var index = 0;
                    while (this.time_ >= keys[index + 1][0]) {
                        index++;
                    }
                    this.left = keys[index][0];
                    this.right = keys[index + 1][0];
                    var diff = 1.0 / (this.right - this.left);
                    this.recip = (isFinite(diff) ? diff : 0);
                    this.p0 = keys[index][1];
                    this.p1 = keys[index + 1][1];
                    if (this._isHermite()) {
                        this._calcTangents(keys, index);
                    }
                }
            }
        },

        // returns true if the curve is a hermite and false otherwise
        _isHermite: function () {
            return [pc.CURVE_CATMULL,
                pc.CURVE_CARDINAL,
                pc.CURVE_CARDINAL_STABLE].indexOf(this.curve.type) != -1;
        },

        // calculate tangents for the hermite curve
        _calcTangents: function (keys, index) {
            var a;
            var b = keys[index];
            var c = keys[index + 1];
            var d;

            if (index === 0) {
                a = [keys[0][0] + (keys[0][0] - keys[1][0]),
                    keys[0][1] + (keys[0][1] - keys[1][1])];
            } else {
                a = keys[index - 1];
            }

            if (index == keys.length - 2) {
                d = [keys[index + 1][0] + (keys[index + 1][0] - keys[index][0]),
                    keys[index + 1][1] + (keys[index + 1][1] - keys[index][1])];
            } else {
                d = keys[index + 2];
            }

            if (this.curve.type === pc.CURVE_CARDINAL_STABLE) {
                // calculate tangent scale (due to non-uniform knot spacing)
                var s1_ = 2 * (c[0] - b[0]) / (c[0] - a[0]);
                var s2_ = 2 * (c[0] - b[0]) / (d[0] - b[0]);

                this.m0 = this.curve.tension * (isFinite(s1_) ? s1_ : 0) * (c[1] - a[1]);
                this.m1 = this.curve.tension * (isFinite(s2_) ? s2_ : 0) * (d[1] - b[1]);
            } else {
                // original tangent scale calc
                var s1 = (c[0] - b[0]) / (b[0] - a[0]);
                var s2 = (c[0] - b[0]) / (d[0] - c[0]);

                var a_ = b[1] + (a[1] - b[1]) * (isFinite(s1) ? s1 : 0);
                var d_ = c[1] + (d[1] - c[1]) * (isFinite(s2) ? s2 : 0);

                var tension = (this.curve.type === pc.CURVE_CATMULL) ? 0.5 : this.curve.tension;

                this.m0 = tension * (c[1] - a_);
                this.m1 = tension * (d_ - b[1]);
            }
        },

        _evaluateHermite: function (p0, p1, m0, m1, t) {
            var t2 = t * t;
            var twot = t + t;
            var omt = 1 - t;
            var omt2 = omt * omt;
            return p0 * ((1 + twot) * omt2) +
                   m0 * (t * omt2) +
                   p1 * (t2 * (3 - twot)) +
                   m1 * (t2 * (t - 1));
        },

        /**
         * @function
         * @name pc.CurveIterator#time
         * @description Get the current iterator time
         * @returns {Number} The current time.
         */
        time: function () {
            return this.time_;
        },

        /**
         * @function
         * @name pc.CurveIterator#evaluate
         * @description Evaluate the curve at the current time
         * @returns {Number} The curve value at the current time
         */
        evaluate: function () {
            var curve = this.curve;

            var result;
            if (curve.type === pc.CURVE_STEP) {
                // step
                result = this.p0;
            } else {
                // calculate normalized t
                var t = (this.recip === 0) ? 0 : (this.time_ - this.left) * this.recip;

                if (curve.type === pc.CURVE_LINEAR) {
                    // linear
                    result = pc.math.lerp(this.p0, this.p1, t);
                } else if (curve.type === pc.CURVE_SMOOTHSTEP) {
                    // smoothstep
                    result = pc.math.lerp(this.p0, this.p1, t * t * (3 - 2 * t));
                } else {
                    // curve
                    result = this._evaluateHermite2(this.p0, this.p1, this.m0, this.m1, t);
                }
            }
            return result;
        },

        /**
         * @function
         * @name pc.CurveIterator#advance
         * @description Advance the iterator by the passed in amount
         * @param {Number} amount The amount of time to advance the iterator
         */
        advance: function (amount) {
            this.time_ += amount;

            if (amount >= 0) {
                if (this.time_ > this.right) {
                    this.reset(this.time_);
                }
            } else if (this.time_ < this.left) {
                this.reset(this.time_);
            }
        },

        /**
         * @function
         * @name pc.CurveIterator.value
         * @description Evaluate the curve at the given time
         * @param {Number} time The time at which to evaluate the curve
         * @returns {Number} The curve value at the given time
         */
        value: function (time) {
            if (time < this.left || time >= this.right) {
                this.reset(time);
            } else {
                this.time_ = time;
            }
            return this.evaluate();
        }
    });

    return {
        CurveIterator: CurveIterator
    };
}()));