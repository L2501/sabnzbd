// For the file-list
function Fileslisting(parent) {
    var self = this;
    self.parent = parent;
    self.fileItems = ko.observableArray([]);

    // Need to reserve these names to be overwritten
    self.filelist_name = ko.observable();
    self.filelist_password = ko.observable();

    // Load the function and reset everything
    self.loadFiles = function(queue_item) {
        // Update
        self.currentItem = queue_item;
        self.fileItems.removeAll()
        self.triggerUpdate() 

        // Update name/password
        self.filelist_name(self.currentItem.name())
        self.filelist_password(self.currentItem.password())

        // Hide ok button and reset
        $('#modal-item-filelist .glyphicon-floppy-saved').hide()
        $('#modal-item-filelist .glyphicon-lock').show()
        
        // Set state of the check-all
        setCheckAllState('#modal-item-files .multioperations-selector input[type="checkbox"]', '#modal-item-files .files-sortable input')

        // Show
        $('#modal-item-files').modal('show');

        // Stop updating on closing of the modal
        $('#modal-item-files').on('hidden.bs.modal', function() {
            self.removeUpdate();
        })
    }

    // Trigger update
    self.triggerUpdate = function() {
        // Call API
        callAPI({
            mode: 'get_files',
            value: self.currentItem.id,
            limit: 5
        }).then(function(response) {
            // When there's no files left we close the modal and the update will be stopped
            // For example when the job has finished downloading
            if(response.files.length === 0) {
                $('#modal-item-files').modal('hide');
                return;
            }

            // Go over them all
            var newItems = [];
            $.each(response.files, function(index, slot) {
                // Existing or updating?
                var existingItem = ko.utils.arrayFirst(self.fileItems(), function(i) {
                    return i.filename() == slot.filename;
                });

                if(existingItem) {
                    // We skip queued files!
                    // They cause problems because they can have the same filename
                    // as files that we do want to be updated.. The slot.id is not unique!
                    if(slot.status == "queued") return false;
                    
                    // Update the rest
                    existingItem.updateFromData(slot);
                } else {
                    // Add files item
                    newItems.push(new FileslistingModel(self, slot));
                }
            })

            // Add new ones in 1 time instead of every single push
            if(newItems.length > 0) {
                ko.utils.arrayPushAll(self.fileItems, newItems);
                self.fileItems.valueHasMutated();
            }

            // Check if we show/hide completed
            if(localStorageGetItem('showCompletedFiles') == 'No') {
                $('.item-files-table tr.files-done').hide();
                $('#filelist-showcompleted').removeClass('hover-button')
            }

            // Refresh with same as rest
            self.setUpdate()
        })
    }

    // Set update         
    self.setUpdate = function() {
        self.updateTimeout = setTimeout(function() {
            self.triggerUpdate()
        }, parent.refreshRate() * 1000)
    }

    // Remove the update
    self.removeUpdate = function() {
        clearTimeout(self.updateTimeout)
    }

    // Move in sortable
    self.move = function(event) {
        // How much did we move?
        var nrMoves = event.sourceIndex - event.targetIndex;
        var direction = (nrMoves > 0 ? 'Up' : 'Down')

        // We have to create the data-structure before, to be able to use the name as a key
        var dataToSend = {};
        dataToSend[event.item.nzf_id()] = 'on';
        dataToSend['session'] = apiKey;
        dataToSend['action_key'] = direction;
        dataToSend['action_size'] = Math.abs(nrMoves);

        // Activate with this weird URL "API"
        callSpecialAPI("./nzb/" + self.currentItem.id + "/bulk_operation/", dataToSend)
    };

    // Remove selected files
    self.removeSelectedFiles = function() {
        // We have to create the data-structure before, to be able to use the name as a key
        var dataToSend = {};
        dataToSend['session'] = apiKey;
        dataToSend['action_key'] = 'Delete';

        // Get all selected ones
        $('.item-files-table input:checked:not(:disabled)').each(function() {
            // Add this item
            dataToSend[$(this).prop('name')] = 'on';
        })

        // Activate with this weird URL "API"
        callSpecialAPI("./nzb/" + self.currentItem.id + "/bulk_operation/", dataToSend).then(function() {
            // Fade it out
            $('.item-files-table input:checked:not(:disabled)').parents('tr').fadeOut(fadeOnDeleteDuration, function() {
                // Set state of the check-all
                setCheckAllState('#modal-item-files .multioperations-selector input[type="checkbox"]', '#modal-item-files .files-sortable input')
            })
        })
    }

    // For changing the passwords
    self.setNzbPassword = function() {
        // Activate with this weird URL "API"
        callSpecialAPI("./nzb/" + self.currentItem.id + "/save/", {
            name: self.currentItem.name(),
            password: $('#nzb_password').val()
        }).then(function() {
            // Refresh, reset and close
            parent.refresh()
            $('#modal-item-filelist .glyphicon-floppy-saved').show()
            $('#modal-item-filelist .glyphicon-lock').hide()
            $('#modal-item-files').modal('hide')
        })
        return false;
    }
    
    // Check all
    self.checkAllFiles = function(item, event) {
        // Get which ones we care about
        var allChecks = $('#modal-item-files .files-sortable input').filter(':not(:disabled):visible');
        
        // We need to re-evaltuate the state of this check-all
        // Otherwise the 'inderterminate' will be overwritten by the click event!
        setCheckAllState('#modal-item-files .multioperations-selector input[type="checkbox"]', '#modal-item-files .files-sortable input')
        
        // Now we can check what happend    
        if(event.target.indeterminate) {
            allChecks.filter(":checked").prop('checked', false)
        } else {
            // Toggle their state by a click
            allChecks.prop('checked', !event.target.checked)
            event.target.checked = !event.target.checked;
            event.target.indeterminate = false;
        }
        // Set state of all the check-all's
        setCheckAllState('#modal-item-files .multioperations-selector input[type="checkbox"]', '#modal-item-files .files-sortable input')
        return true;
    }
    
    // For selecting range and the check-all button
    self.checkSelectRange = function(data, event) {
        if(event.shiftKey) {
            checkShiftRange('#modal-item-files .files-sortable input:not(:disabled)')
        }
        // Set state of the check-all
        setCheckAllState('#modal-item-files .multioperations-selector input[type="checkbox"]', '#modal-item-files .files-sortable input')
        return true;
    }
}

// Indiviual file models
function FileslistingModel(parent, data) {
    var self = this;
    // Define veriables
    self.filename = ko.observable(data.filename);
    self.nzf_id = ko.observable(data.nzf_id);
    self.file_age = ko.observable(data.age);
    self.mb = ko.observable(data.mb);
    self.percentage = ko.observable(fixPercentages((100 - (data.mbleft / data.mb * 100)).toFixed(0)));
    self.canselect = ko.observable(data.nzf_id !== undefined);
    self.isdone =  ko.observable(data.status == "finished");

    // Update internally
    self.updateFromData = function(data) {
        self.filename(data.filename)
        self.nzf_id(data.nzf_id)
        self.file_age(data.age)
        self.mb(data.mb)
        self.percentage(fixPercentages((100 - (data.mbleft / data.mb * 100)).toFixed(0)));
        self.canselect(data.nzf_id !== undefined)
        self.isdone(data.status == "finished")
    }
}

// Model for pagination, since we use it multiple times
function paginationModel(parent) {
    var self = this;

    // Var's
    self.nrPages = ko.observable(0);
    self.currentPage = ko.observable(1);
    self.currentStart = ko.observable(0);
    self.allpages = ko.observableArray([]).extend({ rateLimit: 50 });

    // Has pagination
    self.hasPagination = ko.pureComputed(function() {
        return self.nrPages() > 1;
    })

    // Subscribe to number of items
    parent.totalItems.subscribe(function() {
        // Update
        self.updatePages();
    })

    // Subscribe to changes of pagination limit
    parent.paginationLimit.subscribe(function(newValue) {
        self.updatePages();
        self.moveToPage(self.currentPage());
    })

    // Easy handler for adding a page-link
    self.addPaginationPageLink = function(pageNr) {
        // Return object for adding
        return {
            page: pageNr,
            isCurrent: pageNr == self.currentPage(),
            isDots: false,
            onclick: function(data) {
                self.moveToPage(data.page);
            }
        }
    }

    // Easy handler to add dots
    self.addDots = function() {
        return {
            page: '...',
            isCurrent: false,
            isDots: true,
            onclick: function() {}
        }
    }

    self.updatePages = function() {
        // Empty it
        self.allpages.removeAll();

        // How many pages do we need?
        if(parent.totalItems() <= parent.paginationLimit()) {
            // Empty it
            self.nrPages(1)

            // Reset all to make sure we see something
            self.currentPage(1);
            self.currentStart(0);
        } else {
            // Calculate number of pages needed
            var newNrPages = Math.ceil(parent.totalItems() / parent.paginationLimit())
            
            // Make sure the current page still exists
            if(self.currentPage() > newNrPages) {
                self.moveToPage(newNrPages);
                return;
            }

            // All the cases
            if(newNrPages > 7) {
                // Do we show the first ones 
                if(self.currentPage() < 5) {
                    // Just add the first 4
                    $.each(new Array(5), function(index) {
                        self.allpages.push(self.addPaginationPageLink(index + 1))
                    })
                    // Dots
                    self.allpages.push(self.addDots())
                    // Last one
                    self.allpages.push(self.addPaginationPageLink(newNrPages))
                } else {
                    // Always add the first 
                    self.allpages.push(self.addPaginationPageLink(1))
                        // Dots
                    self.allpages.push(self.addDots())

                    // Are we near the end?
                    if((newNrPages - self.currentPage()) < 4) {
                        // We add the last ones
                        $.each(new Array(5), function(index) {
                            self.allpages.push(self.addPaginationPageLink((index - 4) + (newNrPages)))
                        })
                    } else {
                        // We are in the center so display the center 3
                        $.each(new Array(3), function(index) {
                            self.allpages.push(self.addPaginationPageLink(self.currentPage() + (index - 1)))
                        })

                        // Dots
                        self.allpages.push(self.addDots())
                            // Last one
                        self.allpages.push(self.addPaginationPageLink(newNrPages))
                    }
                }
            } else {
                // Just add them
                $.each(new Array(newNrPages), function(index) {
                    self.allpages.push(self.addPaginationPageLink(index + 1))
                })
            }

            // Change of number of pages?
            if(newNrPages != self.nrPages()) {
                // Update
                self.nrPages(newNrPages);
            }
        }
    }

    // Update on click
    self.moveToPage = function(page) {
        // Update page and start
        self.currentPage(page)
        self.currentStart((page - 1) * parent.paginationLimit())
        // Re-paginate
        self.updatePages();
        // Force full update
        parent.parent.refresh(true);
    }
}