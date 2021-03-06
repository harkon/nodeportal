/***
 * plugin to manage users
 */
var BasePluginController = require(process.cwd() + "/lib/BasePluginController.js");
var settingsPageURL = require(process.cwd() + "/lib/AppProperties").get("SETTINGS_PAGE_URL");
var contactForm = require("./contactForm"), securityForm = require("./securityForm"),
    notificationsForm = require("./notificationsForm");
var PasswordUtil = require(utils.getLibPath() + "/PasswordUtil")

var forms = require("./forms.js"), USER_SCHEMA = "User";
var UserManageController = module.exports = function (id, app) {
    BasePluginController.call(this, id, app);
    var that = this;
    that.listenLoadEvent(function (params) {
        that.get({
            route: '/view'
//            , action:viewUserProfileAction
        });

        that.get({
            route: '/profilePic/:id?', action: getProfilePicAction, isAppRoute: true
        });

        that.get({
            route: '/removeUploadedPic/:id?', action: removeUploadedPicAction
        });
        that.post({
            route: '/updateProfile',
            action: updateUserProfileAction
        });
        that.post({
            route: '/uploadProfilePic',
            action: uploadProfilePicAction
        });
        that.post({
            route: '/updateUserContactDetails',
            action: updateUserContactDetailsAction
        });
        that.post({
            route: '/updateUserSecurityDetails',
            action: updateUserSecurityDetailsAction
        });
        that.post({
            route: '/updateUserNotifications',
            action: updateUserNotificationsAction
        });

        that.addCustomValidations({
            checkOldPassword: {ruleFunction: function (req, model, val, next) {
                //old password field should be equal to current password
                PasswordUtil.check(val, req.session.user.passwordEnc, function (err, isEqual) {
                    next(err, isEqual);
                });
            }, msgs: {en_US: "Please enter correct current password."}}
        });
    });
};

util.inherits(UserManageController, BasePluginController);

function updateUserNotificationsAction(req, res, next) {
    var formObj = utils.clone(notificationsForm), that = this;
    req.params.action = "notificationsForm";

    var userId = that.getPluginHelper().getPostParam(req, "userId");
    var postData = utils.clone(that.getPluginHelper().getPostParams(req));
    delete postData.userId;

    var dbAction = that.getDBActionsLib().getInstance(req, USER_SCHEMA);
    dbAction.update({
        userId: userId,
        notifications: postData
    }, function (err, r) {
        if (err) {
            return next(err, req, res);
        }
        setNotificationsForm(that, req, null, function (err) {
            if(!err){
                that.setSuccessMessage(req, "Notifications updated successfully");
            }
            next(err, req, res);
        })
    });

}

function updateUserSecurityDetailsAction(req, res, next) {
    var formObj = utils.clone(securityForm), that = this;
    req.params.action = "securityForm";
    that.ValidateForm(req, formObj, function (err, result) {
        if (err) {
            next(err, req, res);
            return;
        }
        if (!result.hasErrors) {
            var hash;

            async.series([
                function (n) {
                    var newPassword = that.getPluginHelper().getPostParam(req, "newPassword");
                    PasswordUtil.encrypt(newPassword, function (err, h) {
                        if (h) {
                            hash = h;
                        }
                        n(err, h);
                    });
                },
                function (n) {
                    var userId = that.getPluginHelper().getPostParam(req, "userId");
                    var dbAction = that.getDBActionsLib().getInstance(req, USER_SCHEMA);
                    dbAction.update({
                        userId: userId,
                        passwordEnc: hash
                    }, n);
                }
            ], function (err, result) {
                if (result) {
                    that.setSuccessMessage(req, "Security details updated successfully");
                }
                setSecurityForm(that, req);
                next(null, req, res);
            });
        }
        else {
            that.setErrorMessage(req, "entered-invalid-data");
            setSecurityForm(that, req);
            next(null, req, res);
        }
    });

}

function updateUserContactDetailsAction(req, res, next) {

    var formObj = utils.clone(contactForm), that = this;
    req.params.action = "contactForm";

    var c = function (err) {
        if (err) {
            return   next(err, req, res);
        }
        setContactForm(that, req, null, function (err, r) {
            next(err, req, res);
        });
    };

    that.ValidateForm(req, formObj, function (err, result) {
        if (err) {
            next(err, req, res);
            return;
        }
        if (!result.hasErrors) {
            var userId = that.getPluginHelper().getPostParam(req, "userId"),
                telNo = that.getPluginHelper().getPostParam(req, "telNo"),
                altTelNo = that.getPluginHelper().getPostParam(req, "altTelNo"),
                postData = utils.clone(that.getPluginHelper().getPostParams(req));

            delete postData.userId;
            delete postData.telNo;
            delete postData.altTelNo;

            var dbAction = that.getDBActionsLib().getInstance(req, USER_SCHEMA);
            dbAction.update({
                userId: userId,
                address: postData,
                telNos: {
                    telNo: telNo,
                    altTelNo: altTelNo
                }
            }, function (err, r) {
                if (r) {
                    that.setSuccessMessage(req, "Contact details updated successfully");
                }
                c(err);
            });
        }
        else {
            that.setErrorMessage(req, "entered-invalid-data");
            c(err);
        }
    });


}

function removeUploadedPicAction(req, res, next) {
    var that = this, params = req.params, DBActions = that.getDBActionsLib(),
        dbAction = DBActions.getInstance(req, USER_SCHEMA),
        FileUtil = that.FileUtil;
    var profilePic = req.session.user.profilePic;
    profilePic.uploaded = false;
    dbAction.update({
        userId: req.session.user.userId,
        profilePic: profilePic
    }, function (err, r) {
        if (r) {
            that.setSuccess(req);
        }
        next(err, req, res);
    })

}
function getProfilePicAction(req, res, next) {
    var that = this, params = req.params, DBActions = that.getDBActionsLib(),
//        dbAction = DBActions.getInstance(req, USER_SCHEMA),
        FileUtil = that.FileUtil;

    var userId = params.id,
        file = utils.getUserProfilePicDirPath() + "/" + userId + "/" + userId;

    FileUtil.readImage(file, function (err, data) {
        if (!err) {
            that.setSend(req, data);
        }
        next(err, req, res);
    });
}

function uploadProfilePicAction(req, res, next) {
    var that = this, params = req.params, DBActions = that.getDBActionsLib(),
        dbAction = DBActions.getInstance(req, USER_SCHEMA),
        FileUtil = that.FileUtil;

    var file = req.files.files[0],
        fileName = file.name, tmpPath = file.path;

    var userId = req.session.user.userId,
        folder = utils.getUserProfilePicDirPath() + "/" + userId,
        filePath = utils.realPath(folder, userId), user, profilePic;

    async.series([
        function (n) {
            FileUtil.createDir(folder, n);
        },

        function (n) {
            //remove existing file
            FileUtil.removeFile(filePath, function (err) {
                n(null);
            });
        },
        function (n) {
            //resize image
            that.ImageUtil.resize({
                src: tmpPath,
                dest: filePath,
                width: 300,
                height: 300
            }, n)
        },
//        function (n) {
//            FileUtil.copyFile(tmpPath, filePath, n);
//        },
        function (n) {
            //get user from db
            dbAction.get("findByUserId", userId, function (err, u) {
                if (u) {
                    user = u.toObject();
                }
                else {
                    err = err || new Error("User not found by userId: " + userId);
                }
                n(err);
            })
        },
        function (n) {
            var o = {
                userId: userId
            };
            profilePic = user.profilePic || {};
            profilePic.uploaded = true;
            o.profilePic = profilePic;
            dbAction.update(o, n);
        }
    ], function (err, results) {
        if (!err) {
            req.session.user.profilePic = profilePic;
        }
        next(err, req, res);
    });
}

function setProfileForm(that, req, mode) {
    req.query[that.getPluginId()] = utils.cloneExtend(req.session.user, {redirect: settingsPageURL, email: req.session.user.emailId });

    var profileForm = that.getFormBuilder().DynamicForm(req, utils.clone(forms.ProfileForm), "en_US", mode);

    req.attrs.profileForm = profileForm;
}

function setSecurityForm(that, req, mode) {
    var fm = that.getFormBuilder().DynamicForm(req, utils.clone(securityForm), "en_US", mode);
    req.attrs.securityForm = fm;
}

function setContactForm(that, req, mode, next) {
    var dbAction = that.getDBActionsLib().getInstance(req, USER_SCHEMA);
    dbAction.getByDefaultFinderMethod(req.session.user.userId, function (err, user) {
        if (user) {
            user = user.toObject();
            var o = user.address;
            o = utils.cloneExtend(o, user.telNos);
            req.query[that.getPluginId()] = o;
            var fm = that.getFormBuilder().DynamicForm(req, utils.clone(contactForm), "en_US", mode);
            req.attrs.contactForm = fm;
        }
        next(err);
    });
}

function setNotificationsForm(that, req, mode, next) {
    var dbAction = that.getDBActionsLib().getInstance(req, USER_SCHEMA);
    dbAction.getByDefaultFinderMethod(req.session.user.userId, function (err, user) {
        if (user) {
            user = user.toObject();
            req.query[that.getPluginId()] = user.notifications;
            var fm = that.getFormBuilder().DynamicForm(req, utils.clone(notificationsForm), "en_US", mode);
            req.attrs.notificationsForm = fm;
        }
        next(err);
    });
}

/**
 * Will be called by generic viewFile route action.
 * @param req
 * @param res
 * @param next
 */
UserManageController.prototype.profileFormAction = function (req, res, next) {
    var that = this;
    setProfileForm(that, req, "add");
    next(null, req, res);
};

UserManageController.prototype.contactFormAction = function (req, res, next) {
    var that = this;
    setContactForm(that, req, "add", function (err, r) {
        next(err, req, res);
    });
};

UserManageController.prototype.securityFormAction = function (req, res, next) {
    var that = this;
    setSecurityForm(that, req, "add");
    next(null, req, res);
};

UserManageController.prototype.notificationsFormAction = function (req, res, next) {
    var that = this;
    setNotificationsForm(that, req, "add", function (err, r) {
        next(err, req, res);
    });
};


UserManageController.prototype.rolesAction = function (req, res, next) {
    var that = this;
    var roleDBAction = that.getDBActionsLib().getInstance(req, "Role");
    var roleIds = req.session.user.roles;
    var roles = [];
    async.map(roleIds, function(roleId, n){
        roleDBAction.get("findByRoleId", roleId, function(err, role){
            if(role){
                roles.push(role.toObject());
            }
            n(err);
        });
    }, function(err, r){
        req.attrs.roles = roles;
        Debug._li(">> ", roles, true)
        next(err, req, res);
    })
};
function updateUserProfileAction(req, res, next) {
    var formObj = utils.clone(forms.ProfileForm), that = this;
    req.params.action = "profileForm";

    that.ValidateForm(req, formObj, function (err, result) {
        if (err) {
            next(err, req, res);
            return;
        }
        if (!result.hasErrors) {
            var redirect = that.getPluginHelper().getPostParam(req, "redirect"),
                dbAction = that.getDBActionsLib().getInstance(req, USER_SCHEMA);
            that.getDBActionsLib().populateModelAndUpdate(req, USER_SCHEMA, {}, {emailId: "email"}, function (err, result) {
                if (err) {
                    return next(err, req, res);
                }
                dbAction.get("findByEmailId", req.session.user.emailId, function (err, user) {
                    if (user) {
                        req.session.user = user;
                        that.setSuccessMessage(req, "User profile updated successfully");
                    }
//                    that.setRedirect(req, redirect);
                    setProfileForm(that, req);
                    next(err, req, res);
                });
            });
        }
        else {
            setProfileForm(that, req);
            that.setErrorMessage(req, "entered-invalid-data");
            next(err, req, res);
        }
    });

}


//UserManageController.prototype.render = function (req, res, next) {
//    var view = "view";
//    var ret = {};
//    req.query[this.getPluginId()] = utils.cloneExtend(req.session.user, {redirect: settingsPageURL, email: req.session.user.emailId });
//
//    ret.profileForm = this.getFormBuilder().DynamicForm(req, forms.ProfileForm, "en_US", "add");
//    next(null, [ view, ret ]);
//};
