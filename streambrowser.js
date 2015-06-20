(function ($, count, window) {
    
    var ef = function () {},
    methods = {
        init: function (opts) {
            var T = this;
            if (!T.length || T.data('streambrowser')) {
                // There are no elements or this object has already been initialised
                return T;
            } else if (T.length > 1) {
                T.each(function () {
                    $(this).streamBrowser(opts);
                });
                return T;
            }
            var data = {
                instanceid: ++count,
                filterfields: {},
                loading: false,
                s: $.fn.extend({
                    data: [],
                    filter: null,
                    filterdelay: 250,
                    headers: [],
                    onafterredraw: ef,
                    onajaxerror: ef,
                    onbeforesend: ef,
                    oninit: ef,
                    onsendfail: ef,
                    onsendsuccess: ef,
                    scrollthreshold: 50,
                    snapheaders: true
                }, opts),
                orderingon: {},
                offset: 0
            },
            widths = [],
            filterinterval = false,
            skip = [];
            
            /**
             * Render this data browser
             */
            data.s.render = function () {
                var columns = data.s.columns,
                main = data.s.data;
                T.append(data.s.renderHeader(columns));
                T.append(data.s.renderBody(main));
                bindEvents();
            };
            
            /**
             * Render the header row for the browser
             * @param {array} columns An array of objects (@see renderHeadColumn())
             * @returns {html}
             */
            data.s.renderHeader = function (columns) {
                var output = '';
                for (var i = 0; i < columns.length; i++) {
                    columns[i].index = i;
                    output += data.s.renderHeadColumn(columns[i]);
                }
                return getHtml('div', getHtml('div', output, 'sbheader-' + T[0].id, 'streambrowser-header'), null, 'sbheader-container');
            };
            
            /**
             * Render a single cell in the browser header
             * @param {object} description An object in the form 
             *  {
             *      label: string
             *      fieldname: string
             *      width: int
             *      filterable: boolean
             *      sortable: boolean
             *      index: int
             *  }
             * @returns {html}
             */
            data.s.renderHeadColumn = function (description) {
                var output = getHtml('div', getHtml('span', description.label) + 
                        (description.sortable ? getHtml('span', null, 'streambrowser-arrow') : ''), null, 'sbc-main' + 
                        (description.sortable ? ' sbc-sortable' : ''));
                if (description.filterable) {
                    // Add a search field because this field is searchable
                    output += getHtml('input', null, null, 'stream-browser-search', {
                        placeholder: 'Search', 
                        'data-fieldname': description.fieldname
                    });
                }
                widths[widths.length] = description.width;
                return getHtml('div', output, null, 'streambrowser-head-column', {
                    'data-colindex': description.index,
                    'data-fieldname': description.fieldname,
                    style: 'width:' + description.width + ';'
                });
            };
            
            /**
             * Render the body of the browser
             * @param {array} body An array of arrays 
             * @returns {html}
             */
            data.s.renderBody = function (body) {
                var output = '';
                for (var i = 0; i < body.length; i++) {
                    output += data.s.renderRow(body[i], i);
                }
                return getHtml('div', output, null, 'stream-browser-body');
            };
            
            /**
             * Render a row in the browser body
             * @param {array} row An array of values
             * @param {int} rowindex The index of the row in browser body
             * @returns {html}
             */
            data.s.renderRow = function (row, rowindex) {
                var output = '';
                for (var i = 0; i < row.length; i++) {
                    output += data.s.renderCell(row[i], i);
                }
                return getHtml('div', output, 'sbrow-' + T[0].id + '-' + rowindex, 'streambrowser-row');
            };
            
            /**
             * Render a cell in the browser body
             * @param {string} label The label
             * @param {int} colindex The index of the cell in row
             * @returns {html}
             */
            data.s.renderCell = function (label, colindex) {
                var output = getHtml('div', label, null, 'sb-cell', {
                    'data-colindex': colindex,
                    style: 'width:' + widths[colindex] + ';'
                });
                return output;
            };
            
            /**
             * Filter the data browser
             */
            function filter() {
                if (filterinterval !== false) {
                    // Clear the search interval
                    window.clearTimeout(filterinterval);
                }
                var fieldname = $(this).data('fieldname');
                data.filterfields[fieldname] = this.value;
                var payload = {
                    filterfields: data.filterfields,
                    orderfields: data.orderingon
                };
                if (data.s.onbeforesend.call(T, payload, true) === false) {
                    // Designer cancelled the request for some reason
                    return;
                }
                filterinterval = window.setTimeout(function () {
                    // After the timeout, reload the page data
                    reloadData(payload);
                }, data.s.filterdelay);
            }
            
            /**
             * Click handler for when one of the ordering fields are clicked
             */
            function order() {
                var t = $(this),
                fieldname = t.closest('.streambrowser-head-column').data('fieldname');
                if (fieldname in data.orderingon) {
                    // This field is already being ordered on
                    if (data.orderingon[fieldname] === 'asc') {
                        data.orderingon[fieldname] = 'desc';
                        t.removeClass('sbcs-asc').addClass('sbcs-desc');
                    } else {
                        delete data.orderingon[fieldname];
                        t.removeClass('sbcs-desc');
                    }
                } else {
                    // The user isn't currently ordering on this field
                    data.orderingon[fieldname] = 'asc';
                    t.addClass('sbcs-asc');
                }
                var payload = {
                    filterfields: data.filterfields,
                    orderfields: data.orderingon
                };
                if (data.s.onbeforesend.call(T, payload, true) === false) {
                    // Designer cancelled the request for some reason
                    return;
                }
                reloadData(payload);
            }
            
            /**
             * Load more data for the browser when nearing the end of the current list
             */
            function loadMore() {
                var rect = $('.stream-browser-body')[0].getBoundingClientRect();
                if (($('.streambrowser-row:last').offset().top - rect.top) - rect.height > -data.s.scrollthreshold && !data.loading) {
                    // The last row is almost in view and the system is not in the process of getting more data
                    data.loading = true;
                    var payload = {
                        filterfields: data.filterfields,
                        orderfields: data.orderingon,
                        offset: data.offset
                    };
                    if (canSkip(payload)) {
                        // There is no need to get more data because all data for this given query has been returned
                        return;
                    }
                    if (data.s.onbeforesend.call(T, payload, true) === false) {
                        // Designer cancelled the request for some reason
                        return;
                    }
                    $.ajax({
                        url: data.s.filter,
                        type: 'post',
                        dataType: 'json',
                        data: {
                            payload: JSON.stringify(payload)
                        }
                    }).done(function (e) {
                        if (e.result === 'OK') {
                            if (data.s.onsendsuccess.call(T, e) !== false) {
                                // Designer has said that it is okay to continute
                                if (!e.data) {
                                    addToSkip(payload);
                                    return;
                                }
                                var dest = $('.stream-browser-body', T);
                                data.s.data = data.s.data.concat(e.data);
                                data.offset = data.s.data.length;
                                data.loading = false;
                                // @TODO: Append the rows, or re render with data.s.data?????
                                // Now re-render the body
                                for (var i = 0; i < e.data.length; i++) {
                                    dest.append(data.s.renderRow(e.data[i], i));
                                }
                                data.s.onafterredraw.call(T);
                            }
                        } else {
                            // NB: Used a separate data.loading to prevent re-entrancy before the start row has been reset
                            data.loading = false;
                            console.error(e.result);
                            data.s.onsendfail.call(T, e);
                        }
                    }).fail(function (e) {
                        data.loading = false;
                        console.error(e.resultText);
                        data.s.onajaxerror.call(T, e);
                    });
                }
            }
            
            /**
             * Reload the data in the browser
             * @param {object} payload
             */
            function reloadData(payload) {
                $.ajax({
                    url: data.s.filter,
                    type: 'post',
                    dataType: 'json',
                    data: {
                        payload: JSON.stringify(payload)
                    }
                }).done(function (e) {
                    if (e.result === 'OK') {
                        if (data.s.onsendsuccess.call(T, e) !== false) {
                            var dest = $('.stream-browser-body', T);
                            // Clear the body
                            dest.html('');
                            // Now re-render the body
                            for (var i = 0; i < e.data.length; i++) {
                                dest.append(data.s.renderRow(e.data[i], i));
                            }
                            data.s.onafterredraw.call(T);
                        }
                    } else {
                        console.error(e.result);
                        data.s.onsendfail.call(T, e);
                    }
                }).fail(function (e) {
                    console.error(e.resultText);
                    data.s.onajaxerror.call(T, e);
                });
            };
            
            /**
             * A given payload does not return more data, therefore add it to a list of payloads for which server calls will not be made
             * @param {object} payload The payload being used to get data
             */
            function addToSkip(payload) {
                var key = payload.filterfields + '_' + payload.orderfields + '_' + data.offset;
                skip[key] = true;
            }
            
            /**
             * Determine whether it is okay to skip a server call because there are no more results
             * @param {object} payload The payload being used to get data
             * @returns {boolean} <b>True</b> if it is okay skip searching for a given payload
             */
            function canSkip(payload) {
                var key = payload.filterfields + '_' + payload.orderfields + '_' + data.offset;
                return key in skip;
            }
            
            /**
             * Bind events 
             */
            function bindEvents() {
                $('.stream-browser-search', T).unbind('keyup.sbfilter').bind('keyup.sbfilter', filter);
                // 
                $('.sbc-sortable', T).unbind('click.sborder').bind('click.sborder', order);
                $('.stream-browser-body', T).unbind('scroll.sbscroll').bind('scroll.sbscroll', loadMore);
            }
            
            (function () {
                // Initialisation functions
                data.s.render();
                data.offset = data.s.data.length;
                T.addClass('streambrowser').data('streambrowser', data);
                data.s.oninit.call(T);
            })();
            return T;
        }
    };
    
    /**
     * Generate a xhtml element, e.g. a div element
     * @syntax cHE.getHtml(tagname, body, htmlid, cssclass, {attribute: value});
     * @param {string} tagname The type of element to generate
     * @param {string} body The body to go with 
     * @param {string} id The id of this element
     * @param {string} cssclass The css class of this element
     * @param {object} moreattrs An object in the form {html_attribute: value, ...}
     * @returns {html} The relevant html as interpreted by the browser
     */
    function getHtml(tagname, body, id, cssclass, moreattrs) {
        var html = document.createElement(tagname);
        if (body) {
            html.innerHTML = body;
        }
        if (id) {
            html.id = id;
        }
        if (cssclass) {
            html.className = cssclass;
        }
        setAttributes(html, moreattrs);
        return html.outerHTML;
    };

    /**
     * Set the custom attributes
     * @param {object(DOMElement)} obj
     * @param {object(plain)} attrs
     * @returns {object(DOMElement)}
     */
    function setAttributes(obj, attrs) {
        if (CM.is_object(attrs)) {
            for (var x in attrs) {
                if (attrs.hasOwnProperty(x)) {
                    var val = attrs[x];
                    if (typeof val === 'boolean') {
                        // Convert booleans to their integer representations
                        val = val ? 1 : 0;
                    }
                    obj.setAttribute(x, val);
                }
            }
        }
    }
    
    $.fn.streamBrowser = function(methodOrOpts) {
        var T = this;
        if (methods[methodOrOpts]) {
            // The first option passed is a method, therefore call this method
            return methods[methodOrOpts].apply(T, Array.prototype.slice.call(arguments, 1));
        } else if (Object.prototype.toString.call(methodOrOpts) === '[object Object]' || !methodOrOpts) {
            // The default action is to call the init function
            return methods.init.apply(T, arguments);
        } else {
            // The user has passed us something dodgy, throw an error
            $.error(['The method ', methodOrOpts, ' does not exist'].join(''));
        }
    };
    
})(jQuery, 0, this);