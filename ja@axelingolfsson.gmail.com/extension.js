const St = imports.gi.St;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Main = imports.ui.main;
const Soup = imports.gi.Soup;

const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());


// jaResult is where the displayment layout for each result is configured.
function JaResult(result) {
    this._init(result);
}

JaResult.prototype = {
    _init: function (resultMeta) {
        this.actor = new St.Bin({
            reactive: true,
            track_hover: true,
            can_focus: true,
            style_class: 'ja-actor'
        });

        let content = new St.BoxLayout({
            vertical: false
        })

        this.actor.set_child(content);

        let result = new St.BoxLayout({
            vertical: true
        });

        content.add(result, {
            x_fill: false,
            x_align: St.Align.START
        });

        let nameLabel = new St.Label({
            text: resultMeta.name,
            style_class: 'name-label'
        });

        let addressLabel = new St.Label({
            text: resultMeta.address,
        });

        let phoneLabel = new St.Label({
            text: resultMeta.phones,
        });

        let emailLabel = new St.Label({
            text: resultMeta.email,
        });

        result.add(nameLabel, {
            x_fill: false,
            x_align: St.Align.START
        });

        result.add(addressLabel, {
            x_fill: false,
            x_align: St.Align.START
        });

        result.add(phoneLabel, {
            x_fill: false,
            x_align: St.Align.START
        });

        result.add(emailLabel, {
            x_fill: false,
            x_align: St.Align.START
        });

    }
}

/* JaProvider object is a subclass of Search.SearchProvider and is where all
 * the search logic is defined.
 * */
var jaProvider;

const JaProvider = new Lang.Class({
    Name: 'JaProvider',

    _init: function () {
        this.parent('JA.IS');
    },

    _results : {},

    removePrefix: function (terms) {
        let ja_prefix = 'ja';

        if (terms[0] == ja_prefix) {
            return terms.slice(1);
        } else {
            return [];
        }

    },

    getInitialResultSet: function(raw_terms) {

        /* We only make a network query to ja.is if the user has the prefix
         * "ja " on his search string. If he has, we need to remove this
         * prefix from the query string. If he hasn't, we terminate this
         * function and return no results.
         * */
        let terms = this.removePrefix(raw_terms);
        if (terms.length == 0) {
            this.searchSystem.pushResults(this, []);
            return;
        }

        let that = this;
        let url = 'http://en.ja.is/kort/search_json/?q=' + terms.join('%20') + '*';
        let request = Soup.Message.new('GET', url);

        _httpSession.queue_message(request, Lang.bind(this, function(_httpSession, message) {
            if (message.status_code === 200) {
                let results = JSON.parse(request.response_body.data).map.items,
                    ids = [];

                for (let i = 0; i < results.length; i++) {
                    let person = results[i];
                    that._results[person.common_id] = person;
                    ids.push(person.common_id)
                }

                that.searchSystem.pushResults(this, ids);
            }
        }));
    },

    getSubsearchResultSet: function (prevResults, terms) {
        /* The ja.is api that we use can handle more powerful search queries
         * then we can, using our json object. For instance, we can search by
         * occupation but we don't have that in our json object. Therefore, we
         * will always make a new network query when we get new search terms.
         * */
        this.getInitialResultSet(terms);
    },

    getResultMeta: function (id) {
        let result = this._results[id],
            person = {
                id: result.common_id,
                name: result.title,
                address: (function () {
                    // Join street and postal station by comma
                    let full_address = [result.address, result.postal_station];
                    return full_address.filter(function (i) {
                        return typeof i != undefined;
                    }).join(', ');
                })(),
                phones: (function () {
                    // Join all phone numbers by comma
                    let phone = result.phone || null,
                        phones = result.additional_phones || [];
                    if (phone) {
                        phones.unshift(phone)
                    }
                    return phones.map(function (p) {
                        return p.pretty;
                    }).join(', ');
                })(),
                email: result.email || ''
            };
        return person;
    },

    getResultMetas: function (ids, callback) {
        let metas = ids.map(this.getResultMeta, this);
        callback(metas);
    },

    createResultActor: function (resultMeta, terms) {
        let result = new JaResult(resultMeta);
        return result.actor;
    },

    activateResult: function (id) {
        /* When a user activates a result by pressing return or clicking it,
         * the targeted result will be opened in the browser.
         * */
        let person = this._results[id];
        let url = 'http://ja.is/?q=' + person.title + '%2C%20' + person.address;
        Gio.app_info_launch_default_for_uri(url, null);
    }
});

function init() {
    jaProvider = new JaProvider();
}

function enable() {
    Main.overview.addSearchProvider(jaProvider);

    /* This is the only way I know to change results grid layout in Gnome 3.6.
     * We add a new class 'ja-actor-container' to the search boxes which will
     * make them wider and we increase the row limit for ja.is results from one
     * to two.
     * */
    let grid = Main.overview._viewSelector._searchResults
        ._metaForProvider(jaProvider).resultDisplay._grid;
    grid.actor.style_class = 'ja-actor-container';
    grid._rowLimit = 2;
}

function disable() {
    Main.overview.removeSearchProvider(jaProvider);
}
