/*
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

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

        result.add(
            new St.Label({
                text: resultMeta.name,
                style_class: 'name-label'
            }), {
                x_fill: false,
                x_align: St.Align.START
            }
        );

        if (resultMeta.occupation) {
            result.add(
                new St.Label({
                    text: resultMeta.occupation,
                }), {
                    x_fill: false,
                    x_align: St.Align.START
                }
            );
        }

        if (resultMeta.address) {
            result.add(
                new St.Label({
                    text: resultMeta.address,
                }), {
                    x_fill: false,
                    x_align: St.Align.START
                }
            );
        }

        result.add(
            new St.Label({
                text: resultMeta.phone,
            }), {
                x_fill: false,
                x_align: St.Align.START
            }
        );

    }
}

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
        let url = 'http://ja.is/search/?term=' + terms.join('%20') + '*';
        let request = Soup.Message.new('GET', url);

        _httpSession.queue_message(request, Lang.bind(this, function(_httpSession, message) {
            if (message.status_code === 200) {
                let all_results = JSON.parse(request.response_body.data).results,
                    results = all_results.white.concat(all_results.yellow),
                    ids = [];

                for (let i = 0; i < results.length; i++) {
                    let person = results[i];
                    that._results[person.nameid] = person;
                    ids.push(person.nameid)
                }

                that.searchSystem.pushResults(this, ids);
            }
        }));
    },

    getSubsearchResultSet: function (prevResults, terms) {
        /* The ja.is api that we use can handle more powerful search queries
         * then we can, using our json object. For instance, we can search by
         * postal station or city but we don't have that in our json object.
         * Therefore, we will always make a new network query when we get new
         * search terms.
         * */
        this.getInitialResultSet(terms);
    },

    getResultMeta: function (id) {
        let result = this._results[id],
            person = {
                id: result.nameid,
                name: result.title,
                occupation: result.occupation || null,
                address: result.address,
                phone: result.number
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
