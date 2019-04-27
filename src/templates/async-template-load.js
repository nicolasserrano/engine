Object.assign(pc, function () {

    var AsyncTemplateLoad = function AsyncTemplateLoad(app, json) {
        this._app = app;
        this._json = json;

        this._entities = json.instance_entities; // moved here from the scene by collapse
        this._expanded = {};
    };

    AsyncTemplateLoad.prototype.run = function () {
        var templateIds = pc.TemplateUtils.extractTemplateIds(this._entities);

        new pc.LoadDependencies(this._app, templateIds, this._onLoad.bind(this)).run();
    };

    AsyncTemplateLoad.prototype._onLoad = function () {
        this._expandAll();

        var root = this._callParser();

        var parent = this._app.root.findByGuid(this._json.parent);

        parent.addChild(root);
    };

    AsyncTemplateLoad.prototype._expandAll = function () {
        for (var guid in this._entities) {
            this._expanded[guid] = pc.Template.expand_entity(
                this._app, this._entities[guid]);
        }
    };

    AsyncTemplateLoad.prototype._callParser = function () {
        var h = { entities: this._expanded };

        return new pc.SceneParser(this._app).parse(h); // root's parent is null
    };
    
    return {
        AsyncTemplateLoad: AsyncTemplateLoad
    };
}());
